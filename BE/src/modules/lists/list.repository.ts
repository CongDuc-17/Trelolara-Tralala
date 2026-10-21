import { prisma, runInTransaction, type DatabaseClient } from '../database';
import { deleteListTree } from './list-deletion';
import type { ListBoardState, ListRecord, ListStatus } from './lists.types';

export class ListsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}

	inTransaction<T>(
		work: (repository: ListsRepository, client: DatabaseClient) => Promise<T>,
	): Promise<T> {
		return runInTransaction(
			(client) => work(new ListsRepository(client), client),
			this.client,
		);
	}

	async lockBoard(boardId: string): Promise<void> {
		const board = await this.client.boards.findUnique({
			where: { id: boardId },
			select: { projectId: true },
		});
		if (board) {
			await this.client
				.$queryRaw`SELECT id FROM "Projects" WHERE id = ${board.projectId} FOR UPDATE`;
		}
		await this.client
			.$queryRaw`SELECT id FROM "Boards" WHERE id = ${boardId} FOR UPDATE`;
	}

	async lockList(listId: string): Promise<void> {
		const list = await this.client.lists.findUnique({
			where: { id: listId },
			select: { boardId: true },
		});
		if (list) await this.lockBoard(list.boardId);
		await this.client
			.$queryRaw`SELECT id FROM "Lists" WHERE id = ${listId} FOR UPDATE`;
	}

	getBoardState(boardId: string): Promise<ListBoardState | null> {
		return this.client.boards.findUnique({
			where: { id: boardId },
			select: {
				id: true,
				projectId: true,
				status: true,
				deletedAt: true,
				project: { select: { status: true, deletedAt: true } },
			},
		});
	}

	getAllListsByBoardId(boardId: string, status?: ListStatus): Promise<ListRecord[]> {
		return this.client.lists.findMany({
			where: { boardId, status },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
		});
	}

	getActiveListsByBoardId(boardId: string): Promise<ListRecord[]> {
		return this.client.lists.findMany({
			where: { boardId, status: 'ACTIVE', deletedAt: null },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
		});
	}

	getListById(listId: string): Promise<ListRecord | null> {
		return this.client.lists.findUnique({ where: { id: listId } });
	}

	createList(name: string, boardId: string, position: number): Promise<ListRecord> {
		return this.client.lists.create({ data: { name, boardId, position } });
	}

	updateListName(listId: string, name: string): Promise<ListRecord> {
		return this.client.lists.update({ where: { id: listId }, data: { name } });
	}

	updateListPosition(listId: string, position: number): Promise<ListRecord> {
		return this.client.lists.update({ where: { id: listId }, data: { position } });
	}

	archiveList(listId: string): Promise<ListRecord> {
		return this.client.lists.update({
			where: { id: listId },
			data: { status: 'ARCHIVED', deletedAt: new Date() },
		});
	}

	restoreList(listId: string): Promise<ListRecord> {
		return this.client.lists.update({
			where: { id: listId },
			data: { status: 'ACTIVE', deletedAt: null },
		});
	}

	deleteList(listId: string): Promise<void> {
		return deleteListTree(this.client, listId);
	}
}
