import { BoardsRepository } from '@/modules/boards/boards.repository';
import type { DatabaseClient } from '@/modules/database';

describe('BoardsRepository transaction boundaries', () => {
	it('locks the project before its board', async () => {
		const queries: string[] = [];
		const client = {
			boards: { findUnique: jest.fn().mockResolvedValue({ projectId: 'project' }) },
			$queryRaw: jest.fn().mockImplementation((parts: TemplateStringsArray) => {
				queries.push(parts.join('?'));
				return Promise.resolve([]);
			}),
		};
		await new BoardsRepository(client as unknown as DatabaseClient).lockBoard(
			'board',
		);
		expect(queries).toEqual([
			'SELECT id FROM "Projects" WHERE id = ? FOR UPDATE',
			'SELECT id FROM "Boards" WHERE id = ? FOR UPDATE',
		]);
	});

	it('routes every repository operation inside a unit of work to the transaction client', async () => {
		const transaction = {
			boards: { create: jest.fn().mockResolvedValue({ id: 'board' }) },
		};
		const root = {
			$transaction: jest.fn().mockImplementation((work) => work(transaction)),
			boards: { create: jest.fn() },
		};
		await new BoardsRepository(root as unknown as DatabaseClient).inTransaction(
			(repository) => repository.createBoard('project', 'Board'),
		);
		expect(transaction.boards.create).toHaveBeenCalledWith({
			data: { projectId: 'project', name: 'Board', description: undefined },
		});
		expect(root.boards.create).not.toHaveBeenCalled();
	});

	it('deletes the full board tree in the outer transaction and aborts on a child failure', async () => {
		const transaction = {
			boards: {
				findUnique: jest.fn().mockResolvedValue({ projectId: 'project' }),
				delete: jest.fn(),
			},
			$queryRaw: jest.fn(),
			checklistItems: { deleteMany: jest.fn() },
			checklists: { deleteMany: jest.fn() },
			cardLabels: { deleteMany: jest.fn() },
			cardMembers: { deleteMany: jest.fn() },
			cardComments: { deleteMany: jest.fn() },
			cardAttachments: {
				findMany: jest.fn().mockResolvedValue([]),
				deleteMany: jest
					.fn()
					.mockRejectedValue(new Error('attachment delete failed')),
			},
			cardActivity: { deleteMany: jest.fn() },
			cards: { deleteMany: jest.fn() },
			lists: { deleteMany: jest.fn() },
			labels: { deleteMany: jest.fn() },
			boardMembers: { deleteMany: jest.fn() },
			invitations: { deleteMany: jest.fn() },
		};
		const root = {
			$transaction: jest.fn().mockImplementation((work) => work(transaction)),
		};
		const repository = new BoardsRepository(root as unknown as DatabaseClient);
		await expect(
			repository.inTransaction((scoped) => scoped.deleteBoard('board')),
		).rejects.toThrow('attachment delete failed');
		expect(root.$transaction).toHaveBeenCalledTimes(1);
		expect(transaction.cardActivity.deleteMany).not.toHaveBeenCalled();
		expect(transaction.boards.delete).not.toHaveBeenCalled();
	});
});
