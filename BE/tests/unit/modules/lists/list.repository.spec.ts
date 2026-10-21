import { ListsRepository } from '@/modules/lists/list.repository';
import { deleteListTree } from '@/modules/lists/list-deletion';
import type { DatabaseClient } from '@/modules/database';

jest.mock('@/modules/lists/list-deletion', () => ({ deleteListTree: jest.fn() }));

describe('ListsRepository persistence boundaries', () => {
	it('locks Project, Board and List in that order with bound resource IDs', async () => {
		const client = {
			boards: { findUnique: jest.fn().mockResolvedValue({ projectId: 'project' }) },
			lists: { findUnique: jest.fn().mockResolvedValue({ boardId: 'board' }) },
			$queryRaw: jest.fn().mockResolvedValue([]),
		};
		await new ListsRepository(client as unknown as DatabaseClient).lockList('list');
		expect(
			client.$queryRaw.mock.calls.map(([parts, id]) => [parts.join('?'), id]),
		).toEqual([
			['SELECT id FROM "Projects" WHERE id = ? FOR UPDATE', 'project'],
			['SELECT id FROM "Boards" WHERE id = ? FOR UPDATE', 'board'],
			['SELECT id FROM "Lists" WHERE id = ? FOR UPDATE', 'list'],
		]);
	});

	it('does not invent ancestor locks for a missing list', async () => {
		const client = {
			lists: { findUnique: jest.fn().mockResolvedValue(null) },
			$queryRaw: jest.fn().mockResolvedValue([]),
		};
		await new ListsRepository(client as unknown as DatabaseClient).lockList(
			'missing',
		);
		expect(client.$queryRaw).toHaveBeenCalledTimes(1);
		expect(client.$queryRaw.mock.calls[0][1]).toBe('missing');
	});

	it('orders reads by position and id while leaving the public status filter optional', async () => {
		const client = { lists: { findMany: jest.fn().mockResolvedValue([]) } };
		const repository = new ListsRepository(client as unknown as DatabaseClient);
		await repository.getAllListsByBoardId('board');
		await repository.getAllListsByBoardId('board', 'ARCHIVED');
		await repository.getActiveListsByBoardId('board');
		expect(client.lists.findMany.mock.calls).toEqual([
			[
				{
					where: { boardId: 'board', status: undefined },
					orderBy: [{ position: 'asc' }, { id: 'asc' }],
				},
			],
			[
				{
					where: { boardId: 'board', status: 'ARCHIVED' },
					orderBy: [{ position: 'asc' }, { id: 'asc' }],
				},
			],
			[
				{
					where: { boardId: 'board', status: 'ACTIVE', deletedAt: null },
					orderBy: [{ position: 'asc' }, { id: 'asc' }],
				},
			],
		]);
	});

	it('routes nested repository work and deletion to the same transaction client', async () => {
		const scoped = {
			boards: { findUnique: jest.fn().mockResolvedValue({ id: 'board' }) },
			lists: {
				findUnique: jest.fn().mockResolvedValue({ id: 'list' }),
				findMany: jest.fn().mockResolvedValue([]),
				create: jest.fn().mockResolvedValue({ id: 'new' }),
				update: jest.fn().mockResolvedValue({ id: 'list' }),
			},
		};
		const root = {
			$transaction: jest
				.fn()
				.mockImplementation((work: (client: typeof scoped) => Promise<unknown>) =>
					work(scoped),
				),
			boards: { findUnique: jest.fn() },
			lists: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
		};
		await new ListsRepository(root as unknown as DatabaseClient).inTransaction(
			async (repository, client) => {
				expect(client).toBe(scoped);
				await repository.getBoardState('board');
				await repository.getListById('list');
				await repository.getActiveListsByBoardId('board');
				await repository.createList('New', 'board', 2);
				await repository.updateListName('list', 'Renamed');
				await repository.updateListPosition('list', 3);
				await repository.archiveList('list');
				await repository.restoreList('list');
				await repository.inTransaction((nested, nestedClient) => {
					expect(nestedClient).toBe(scoped);
					return nested.deleteList('list');
				});
			},
		);
		expect(root.$transaction).toHaveBeenCalledTimes(1);
		expect(root.boards.findUnique).not.toHaveBeenCalled();
		for (const operation of Object.values(root.lists))
			expect(operation).not.toHaveBeenCalled();
		expect(scoped.lists.create).toHaveBeenCalledWith({
			data: { name: 'New', boardId: 'board', position: 2 },
		});
		expect(scoped.lists.update).toHaveBeenCalledWith({
			where: { id: 'list' },
			data: { status: 'ARCHIVED', deletedAt: expect.any(Date) },
		});
		expect(scoped.lists.update).toHaveBeenCalledWith({
			where: { id: 'list' },
			data: { status: 'ACTIVE', deletedAt: null },
		});
		expect(deleteListTree).toHaveBeenCalledWith(scoped, 'list');
	});

	it('propagates a tree deletion failure out of the outer transaction', async () => {
		const failure = new Error('child deletion failed');
		jest.mocked(deleteListTree).mockRejectedValueOnce(failure);
		const scoped = {};
		const root = {
			$transaction: jest
				.fn()
				.mockImplementation((work: (client: typeof scoped) => Promise<unknown>) =>
					work(scoped),
				),
		};
		await expect(
			new ListsRepository(root as unknown as DatabaseClient).inTransaction(
				(repository) => repository.deleteList('list'),
			),
		).rejects.toBe(failure);
		expect(root.$transaction).toHaveBeenCalledTimes(1);
		expect(deleteListTree).toHaveBeenCalledWith(scoped, 'list');
	});
});
