import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import type { DatabaseClient } from '@/modules/database';

describe('BoardMembersRepository', () => {
	it('removes only the assignments in the specified board using the same transaction', async () => {
		const transaction = {
			cardMembers: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
			boardMembers: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
		};
		const root = {
			$transaction: jest.fn().mockImplementation((work) => work(transaction)),
		};
		const repository = new BoardMembersRepository(root as unknown as DatabaseClient);
		await repository.removeMember('board-A', 'member');
		expect(transaction.cardMembers.deleteMany).toHaveBeenCalledWith({
			where: { userId: 'member', card: { list: { boardId: 'board-A' } } },
		});
		expect(transaction.boardMembers.deleteMany).toHaveBeenCalledWith({
			where: { boardId: 'board-A', userId: 'member' },
		});
		expect(root.$transaction).toHaveBeenCalledTimes(1);
	});

	it('reuses the outer transaction and does not call the default client', async () => {
		const root = { $transaction: jest.fn() };
		const transaction = {
			cardMembers: { deleteMany: jest.fn() },
			boardMembers: { deleteMany: jest.fn() },
		};
		await new BoardMembersRepository(root as unknown as DatabaseClient).removeMember(
			'board-A',
			'member',
			transaction as unknown as DatabaseClient,
		);
		expect(root.$transaction).not.toHaveBeenCalled();
		expect(transaction.boardMembers.deleteMany).toHaveBeenCalledTimes(1);
	});
});
