import { deleteListTree } from '@/modules/lists/list-deletion';
import type { DatabaseClient } from '@/modules/database';

describe('deleteListTree', () => {
	const children = [
		'checklistItems',
		'checklists',
		'cardLabels',
		'cardMembers',
		'cardComments',
		'cardAttachments',
		'cardActivity',
		'cards',
	] as const;

	function setup() {
		const calls: string[] = [];
		const repositories = Object.fromEntries(
			children.map((name) => [
				name,
				{
					deleteMany: jest.fn().mockImplementation(async () => {
						calls.push(name);
						return { count: 1 };
					}),
				},
			]),
		) as Record<(typeof children)[number], { deleteMany: jest.Mock }>;
		const transaction = {
			...repositories,
			lists: {
				delete: jest.fn().mockImplementation(async () => {
					calls.push('lists');
					return { id: 'list' };
				}),
			},
			labels: { deleteMany: jest.fn() },
			boardMembers: { deleteMany: jest.fn() },
			boards: { delete: jest.fn() },
		};
		return { transaction, calls };
	}

	it('deletes all card child rows before their list using only the supplied client', async () => {
		const { transaction, calls } = setup();
		await deleteListTree(transaction as unknown as DatabaseClient, 'list');

		expect(calls).toEqual([...children, 'lists']);
		const card = { listId: 'list' };
		expect(transaction.checklistItems.deleteMany).toHaveBeenCalledWith({
			where: { checklist: { card } },
		});
		for (const name of [
			'checklists',
			'cardLabels',
			'cardMembers',
			'cardComments',
			'cardAttachments',
			'cardActivity',
		] as const) {
			expect(transaction[name].deleteMany).toHaveBeenCalledWith({
				where: { card },
			});
		}
		expect(transaction.cards.deleteMany).toHaveBeenCalledWith({ where: card });
		expect(transaction.lists.delete).toHaveBeenCalledWith({
			where: { id: 'list' },
		});
		expect(transaction.labels.deleteMany).not.toHaveBeenCalled();
		expect(transaction.boardMembers.deleteMany).not.toHaveBeenCalled();
		expect(transaction.boards.delete).not.toHaveBeenCalled();
	});

	it('propagates a child deletion failure so the caller can roll back the whole mutation', async () => {
		const { transaction, calls } = setup();
		const failure = new Error('attachment deletion failed');
		transaction.cardAttachments.deleteMany.mockRejectedValueOnce(failure);

		await expect(
			deleteListTree(transaction as unknown as DatabaseClient, 'list'),
		).rejects.toBe(failure);
		expect(calls).toEqual(children.slice(0, children.indexOf('cardAttachments')));
		expect(transaction.cards.deleteMany).not.toHaveBeenCalled();
		expect(transaction.lists.delete).not.toHaveBeenCalled();
	});
});
