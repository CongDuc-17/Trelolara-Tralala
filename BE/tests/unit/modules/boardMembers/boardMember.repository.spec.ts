import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import type { DatabaseClient } from '@/modules/database';

describe('BoardMembersRepository', () => {
	it('removes only the assignments in the specified board using the same transaction', async () => {
		const transaction = {
			cardMembers: {
				findMany: jest.fn().mockResolvedValue([{ cardId: 'card-A' }]),
				deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
			},
			cardActivity: { create: jest.fn() },
			boardMembers: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
		};
		const root = {
			$transaction: jest.fn().mockImplementation((work) => work(transaction)),
		};
		const repository = new BoardMembersRepository(root as unknown as DatabaseClient);
		await repository.removeMember('board-A', 'member', 'actor');
		expect(transaction.cardMembers.deleteMany).toHaveBeenCalledWith({
			where: { userId: 'member', card: { list: { boardId: 'board-A' } } },
		});
		expect(transaction.boardMembers.deleteMany).toHaveBeenCalledWith({
			where: { boardId: 'board-A', userId: 'member' },
		});
		expect(root.$transaction).toHaveBeenCalledTimes(1);
		expect(transaction.cardMembers.findMany).toHaveBeenCalledWith({
			where: { userId: 'member', card: { list: { boardId: 'board-A' } } },
			select: { cardId: true },
		});
		expect(transaction.cardActivity.create).toHaveBeenCalledWith({
			data: {
				cardId: 'card-A',
				userId: 'actor',
				action: 'member_removed',
				metadata: { userId: 'member', reason: 'board_member_removed' },
			},
		});
	});
	it('aborts the membership transaction when assignment history cannot be written', async () => {
		const transaction = {
			cardMembers: {
				findMany: jest.fn().mockResolvedValue([{ cardId: 'card-A' }]),
				deleteMany: jest.fn(),
			},
			cardActivity: {
				create: jest.fn().mockRejectedValue(new Error('Activity failed')),
			},
			boardMembers: { deleteMany: jest.fn() },
		};
		const root = {
			$transaction: jest.fn(
				async (work: (client: DatabaseClient) => Promise<unknown>) =>
					work(transaction as unknown as DatabaseClient),
			),
		};
		await expect(
			new BoardMembersRepository(root as unknown as DatabaseClient).removeMember(
				'board-A',
				'member',
				'actor',
			),
		).rejects.toThrow('Activity failed');
		expect(transaction.boardMembers.deleteMany).not.toHaveBeenCalled();
	});

	it('reuses the outer transaction and does not call the default client', async () => {
		const root = { $transaction: jest.fn() };
		const transaction = {
			cardMembers: {
				findMany: jest.fn().mockResolvedValue([]),
				deleteMany: jest.fn(),
			},
			boardMembers: { deleteMany: jest.fn() },
		};
		await new BoardMembersRepository(root as unknown as DatabaseClient).removeMember(
			'board-A',
			'member',
			'actor',
			transaction as unknown as DatabaseClient,
		);
		expect(root.$transaction).not.toHaveBeenCalled();
		expect(transaction.boardMembers.deleteMany).toHaveBeenCalledTimes(1);
	});
});
