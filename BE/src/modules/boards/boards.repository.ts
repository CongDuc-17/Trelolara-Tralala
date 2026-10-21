import { BoardStatusEnum, RoleStatusEnum, type boards } from '@prisma/client';
import { prisma as database, runInTransaction, type DatabaseClient } from '../database';
import { deleteBoardTree } from './board-deletion';
import type { BoardRecord } from './boards.types';

const activeRole = { status: RoleStatusEnum.ACTIVE, deletedAt: null };

export class BoardsRepository {
	constructor(private readonly client: DatabaseClient = database) {}

	inTransaction<T>(
		work: (repository: BoardsRepository, client: DatabaseClient) => Promise<T>,
	): Promise<T> {
		return runInTransaction(
			(client) => work(new BoardsRepository(client), client),
			this.client,
		);
	}

	async lockProject(projectId: string): Promise<void> {
		await this.client
			.$queryRaw`SELECT id FROM "Projects" WHERE id = ${projectId} FOR UPDATE`;
	}

	async lockBoard(boardId: string): Promise<void> {
		const board = await this.client.boards.findUnique({
			where: { id: boardId },
			select: { projectId: true },
		});
		if (board) await this.lockProject(board.projectId);
		await this.client
			.$queryRaw`SELECT id FROM "Boards" WHERE id = ${boardId} FOR UPDATE`;
	}

	getProject(projectId: string) {
		return this.client.projects.findUnique({
			where: { id: projectId },
			select: { id: true, status: true, deletedAt: true },
		});
	}

	findRole(input: { id?: string; name?: string }) {
		return this.client.roles.findFirst({ where: { ...input, deletedAt: null } });
	}

	async isAdministrator(
		boardId: string,
		projectId: string,
		userId: string,
	): Promise<boolean> {
		const system = await this.client.usersRoles.findFirst({
			where: { userId, role: { ...activeRole, name: 'ADMIN' } },
			select: { id: true },
		});
		if (system) return true;
		const project = await this.client.projectMembers.findFirst({
			where: { projectId, userId, role: { ...activeRole, name: 'PROJECT_ADMIN' } },
			select: { id: true },
		});
		if (project) return true;
		return !!(await this.client.boardMembers.findFirst({
			where: { boardId, userId, role: { ...activeRole, name: 'BOARD_ADMIN' } },
			select: { id: true },
		}));
	}

	async getActorRole(boardId: string, projectId: string, userId: string) {
		const board = await this.client.boardMembers.findFirst({
			where: { boardId, userId, role: activeRole },
			select: { role: { select: { id: true, name: true } } },
		});
		if (board) return board.role;
		const project = await this.client.projectMembers.findFirst({
			where: { projectId, userId, role: activeRole },
			select: { role: { select: { id: true, name: true } } },
		});
		if (project) return project.role;
		const system = await this.client.usersRoles.findFirst({
			where: { userId, role: { ...activeRole, name: 'ADMIN' } },
			select: { role: { select: { id: true, name: true } } },
		});
		return system?.role ?? null;
	}

	createBoard(projectId: string, name: string, description?: string): Promise<boards> {
		return this.client.boards.create({ data: { projectId, name, description } });
	}

	getBoardsByProjectId(projectId: string): Promise<boards[]> {
		return this.client.boards.findMany({
			where: { projectId, deletedAt: null },
			include: { _count: { select: { boardMembers: true } } },
			orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
		});
	}

	getBoardById(boardId: string): Promise<BoardRecord | null> {
		return this.client.boards.findUnique({
			where: { id: boardId },
			select: {
				id: true,
				name: true,
				description: true,
				projectId: true,
				status: true,
				background: true,
				createdAt: true,
				updatedAt: true,
				deletedAt: true,
				_count: { select: { lists: true, boardMembers: true } },
			},
		});
	}

	updateBoard(boardId: string, data: Partial<boards>) {
		return this.client.boards.update({ where: { id: boardId }, data });
	}

	archiveBoard(boardId: string): Promise<boards> {
		return this.updateBoard(boardId, { status: BoardStatusEnum.ARCHIVED });
	}

	async deleteBoard(boardId: string): Promise<void> {
		await this.inTransaction(async (repository, client) => {
			await repository.lockBoard(boardId);
			await deleteBoardTree(client, boardId);
		});
	}
}
