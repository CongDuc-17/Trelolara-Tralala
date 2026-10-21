import { deleteBoardTree } from '@/modules/boards/board-deletion';
import type { DatabaseClient } from '@/modules/database';

describe('deleteBoardTree', () => {
	const children = [
		'checklistItems',
		'checklists',
		'cardLabels',
		'cardMembers',
		'cardComments',
		'cardAttachments',
		'cardActivity',
		'cards',
		'lists',
		'labels',
		'boardMembers',
		'invitations',
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
			boards: {
				delete: jest.fn().mockImplementation(async () => {
					calls.push('boards');
					return { id: 'board' };
				}),
			},
		};
		return { transaction, calls };
	}

	it('uses the supplied client to delete the full tree in foreign key order', async () => {
		const { transaction, calls } = setup();
		await deleteBoardTree(transaction as unknown as DatabaseClient, 'board');

		expect(calls).toEqual([...children, 'boards']);
		const card = { list: { boardId: 'board' } };
		expect(transaction.checklistItems.deleteMany).toHaveBeenCalledWith({
			where: { checklist: { card } },
		});
		for (const name of [
			'checklists',
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
		for (const name of ['lists', 'labels', 'boardMembers', 'invitations'] as const) {
			expect(transaction[name].deleteMany).toHaveBeenCalledWith({
				where: { boardId: 'board' },
			});
		}
		expect(transaction.boards.delete).toHaveBeenCalledWith({
			where: { id: 'board' },
		});
	});

	it('removes legacy relations touching board labels without deleting foreign cards', async () => {
		const { transaction } = setup();
		await deleteBoardTree(transaction as unknown as DatabaseClient, 'board');
		expect(transaction.cardLabels.deleteMany).toHaveBeenCalledWith({
			where: {
				OR: [
					{ card: { list: { boardId: 'board' } } },
					{ label: { boardId: 'board' } },
				],
			},
		});
		expect(transaction.cards.deleteMany).toHaveBeenCalledWith({
			where: { list: { boardId: 'board' } },
		});
	});

	it('propagates failures to the caller transaction and stops deleting', async () => {
		const { transaction, calls } = setup();
		const failure = new Error('database failure');
		transaction.cardAttachments.deleteMany.mockRejectedValueOnce(failure);
		await expect(
			deleteBoardTree(transaction as unknown as DatabaseClient, 'board'),
		).rejects.toBe(failure);
		expect(calls).toEqual(children.slice(0, children.indexOf('cardAttachments')));
		expect(transaction.cards.deleteMany).not.toHaveBeenCalled();
		expect(transaction.boards.delete).not.toHaveBeenCalled();
	});
});
