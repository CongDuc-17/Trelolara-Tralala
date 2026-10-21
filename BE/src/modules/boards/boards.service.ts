import {
	AppError,
	Forbidden,
	InternalServerException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
	uploadImageFromBuffer,
} from '@/common/utils/cloudinary.utils';
import { BoardMembersRepository } from '../boardMembers/boardMember.repository';
import type { DatabaseClient } from '../database';
import { BoardsRepository } from './boards.repository';
import type {
	BackgroundStorage,
	BoardDetails,
	BoardInput,
	BoardMember,
	BoardRecord,
	BoardsPage,
	BoardStatus,
	BoardSummary,
	BoardUpdate,
	UserBoard,
} from './boards.types';

const backgroundStorage: BackgroundStorage = {
	upload: uploadImageFromBuffer,
	delete: deleteImageFromCloudinary,
	extractPublicId: (url) => extractPublicIdFromUrl(url, 'TrelloLike_BoardBackgrounds'),
};

export class BoardsService {
	constructor(
		private readonly boardsRepository = new BoardsRepository(),
		private readonly members = new BoardMembersRepository(),
		private readonly storage: BackgroundStorage = backgroundStorage,
	) {}

	async createBoard(
		projectId: string,
		input: BoardInput,
		actorId: string,
	): Promise<BoardDetails> {
		return this.boardsRepository.inTransaction(async (repository, client) => {
			await repository.lockProject(projectId);
			await this.requireActiveProject(repository, projectId);
			const role = await repository.findRole({ name: 'BOARD_ADMIN' });
			if (!role || role.status !== 'ACTIVE')
				throw new NotFoundException('Board admin role not found');
			const board = await repository.createBoard(
				projectId,
				input.name,
				input.description,
			);
			await this.members.assignUserRoleBoard(board.id, actorId, role.id, client);
			return {
				...this.mapUpdate(board),
				status: board.status,
				roleId: role.id,
				roleName: role.name,
				memberCount: 1,
				listCount: 0,
				createdAt: board.createdAt,
				updatedAt: board.updatedAt,
			};
		});
	}

	async getBoardsOfUserInProject(
		projectId: string,
		userId: string,
		input: { status?: BoardStatus },
		pagination: { page: number; limit: number },
	): Promise<BoardsPage<BoardSummary>> {
		if (!(await this.boardsRepository.getProject(projectId)))
			throw new NotFoundException('Project not found');
		const [rows, totalItems] = await this.members.getBoardsOfUserInProject({
			projectId,
			userId,
			status: input.status,
			skip: (pagination.page - 1) * pagination.limit,
			take: pagination.limit,
		});
		return {
			items: rows.map(({ board }) => ({
				...this.mapUpdate({ ...board, projectId }),
				status: board.status,
				membersCount: board._count.boardMembers,
				listsCount: board._count.lists,
			})),
			totalItems,
			...pagination,
		};
	}

	async getBoardsOfUser(
		userId: string,
		input: { status?: BoardStatus },
		pagination: { page: number; limit: number },
	): Promise<BoardsPage<UserBoard>> {
		const [rows, totalItems] = await this.members.getBoardsOfUser({
			userId,
			status: input.status,
			skip: (pagination.page - 1) * pagination.limit,
			take: pagination.limit,
		});
		return {
			items: rows.map(({ board, role }) => ({
				...this.mapUpdate(board),
				status: board.project.status === 'ARCHIVED' ? 'ARCHIVED' : board.status,
				projectName: board.project.name,
				projectStatus: board.project.status,
				roleId: role.id,
				roleName: role.name,
				membersCount: board._count.boardMembers,
				listsCount: board._count.lists,
			})),
			totalItems,
			...pagination,
		};
	}

	async getBoardById(boardId: string, actorId: string): Promise<BoardDetails> {
		const board = await this.requireBoard(this.boardsRepository, boardId);
		const role = await this.boardsRepository.getActorRole(
			boardId,
			board.projectId,
			actorId,
		);
		if (!role) throw new Forbidden('You do not have access to this board');
		return {
			...this.mapUpdate(board),
			status: board.status,
			roleId: role.id,
			roleName: role.name,
			memberCount: board._count.boardMembers,
			listCount: board._count.lists,
			createdAt: board.createdAt,
			updatedAt: board.updatedAt,
		};
	}

	async updateBoard(boardId: string, input: Partial<BoardInput>): Promise<BoardUpdate> {
		return this.withLockedBoard(boardId, async (repository) => {
			const changes: Partial<BoardInput> = {};
			if (input.name !== undefined) changes.name = input.name;
			if (input.description !== undefined) changes.description = input.description;
			return this.mapUpdate(await repository.updateBoard(boardId, changes));
		});
	}

	async uploadBackground(
		boardId: string,
		file: { buffer: Buffer; mimetype: string },
	): Promise<BoardUpdate> {
		let uploaded: Awaited<ReturnType<BackgroundStorage['upload']>> | undefined;
		let previous: string | null = null;
		let updated: BoardUpdate;
		try {
			// Check lifecycle before uploading; recheck under the lock before committing the new URL.
			await this.withLockedBoard(boardId, async () => undefined);
			uploaded = await this.storage.upload(
				file.buffer,
				file.mimetype,
				'TrelloLike_BoardBackgrounds',
			);
			const image = uploaded;
			updated = await this.withLockedBoard(
				boardId,
				async (repository, _client, board) => {
					previous = board.background;
					return this.mapUpdate(
						await repository.updateBoard(boardId, {
							background: image.secure_url,
						}),
					);
				},
			);
		} catch (error) {
			if (uploaded) await this.cleanupBackground(uploaded.public_id);
			if (error instanceof AppError) throw error;
			throw new InternalServerException();
		}
		const oldId = previous ? this.storage.extractPublicId(previous) : null;
		if (oldId && oldId !== uploaded.public_id) await this.cleanupBackground(oldId);
		return updated;
	}

	async archiveBoard(boardId: string): Promise<void> {
		await this.withLockedBoard(boardId, async (repository) => {
			await repository.archiveBoard(boardId);
		});
	}

	async restoreBoard(boardId: string): Promise<void> {
		await this.withLockedBoard(
			boardId,
			async (repository, _client, board) => {
				await this.requireActiveProject(repository, board.projectId);
				if (board.status !== 'ARCHIVED')
					throw new OptionalException(
						400,
						'Only archived boards can be restored',
					);
				await repository.updateBoard(boardId, {
					status: 'ACTIVE',
					deletedAt: null,
				});
			},
			false,
		);
	}

	async deleteBoard(boardId: string): Promise<void> {
		await this.withLockedBoard(
			boardId,
			async (repository) => {
				await repository.deleteBoard(boardId);
			},
			false,
		);
	}

	async getBoardMembers(boardId: string): Promise<BoardMember[]> {
		await this.requireBoard(this.boardsRepository, boardId);
		return (await this.members.getBoardMembers(boardId)).map((member) => ({
			boardId: member.boardId,
			userId: member.userId,
			name: member.user.name,
			email: member.user.email,
			avatar: member.user.avatar ?? '',
			roleId: member.roleId,
			roleName: member.role.name,
		}));
	}

	async changeRoleOfMemberBoard(
		boardId: string,
		userId: string,
		roleId: string,
		actorId: string,
	): Promise<void> {
		await this.withLockedBoard(boardId, async (repository, client, board) => {
			const role = await repository.findRole({ id: roleId });
			if (!role) throw new NotFoundException('Role not found');
			if (role.status !== 'ACTIVE' || !role.name.startsWith('BOARD_'))
				throw new OptionalException(422, 'Role must be an active board role');
			const member = await this.members.isUserMemberOfBoard(
				boardId,
				userId,
				client,
			);
			if (!member) throw new NotFoundException('Board member not found');
			if (role.name === 'BOARD_ADMIN' || member.role.name === 'BOARD_ADMIN') {
				if (
					!(await repository.isAdministrator(boardId, board.projectId, actorId))
				)
					throw new Forbidden('Only an administrator can change an admin role');
			}
			if (member.role.name === 'BOARD_ADMIN' && role.name !== 'BOARD_ADMIN')
				await this.protectLastAdministrator(boardId, client);
			await this.members.changeRoleOfMemberBoard(boardId, userId, roleId, client);
		});
	}

	async removeMember(boardId: string, userId: string, actorId: string): Promise<void> {
		await this.withLockedBoard(boardId, async (repository, client, board) => {
			const member = await this.members.isUserMemberOfBoard(
				boardId,
				userId,
				client,
			);
			if (!member) throw new NotFoundException('Board member not found');
			if (member.role.name === 'BOARD_ADMIN') {
				if (
					!(await repository.isAdministrator(boardId, board.projectId, actorId))
				)
					throw new Forbidden('Only an administrator can remove an admin');
				await this.protectLastAdministrator(boardId, client);
			}
			await this.members.removeMember(boardId, userId, actorId, client);
		});
	}

	private async protectLastAdministrator(
		boardId: string,
		client: DatabaseClient,
	): Promise<void> {
		if ((await this.members.countAdministrators(boardId, client)) <= 1)
			throw new OptionalException(
				409,
				'Board must retain at least one administrator',
			);
	}

	private async requireActiveProject(
		repository: BoardsRepository,
		projectId: string,
	): Promise<void> {
		const project = await repository.getProject(projectId);
		if (!project) throw new NotFoundException('Project not found');
		if (project.status !== 'ACTIVE' || project.deletedAt)
			throw new OptionalException(409, 'Parent project is read only');
	}

	private async requireBoard(repository: BoardsRepository, boardId: string) {
		const board = await repository.getBoardById(boardId);
		if (!board) throw new NotFoundException('Board not found');
		return board;
	}

	private withLockedBoard<T>(
		boardId: string,
		work: (
			repository: BoardsRepository,
			client: DatabaseClient,
			board: BoardRecord,
		) => Promise<T>,
		active = true,
	): Promise<T> {
		return this.boardsRepository.inTransaction(async (repository, client) => {
			await repository.lockBoard(boardId);
			const board = await this.requireBoard(repository, boardId);
			if (active) {
				await this.requireActiveProject(repository, board.projectId);
				if (board.status !== 'ACTIVE' || board.deletedAt)
					throw new OptionalException(409, 'Board is read only');
			}
			return work(repository, client, board);
		});
	}

	private mapUpdate(board: {
		id: string;
		projectId: string;
		name: string;
		description: string | null;
		background?: string | null;
	}): BoardUpdate {
		return {
			id: board.id,
			projectId: board.projectId,
			name: board.name,
			description: board.description ?? undefined,
			background: board.background ?? undefined,
		};
	}

	private async cleanupBackground(publicId: string): Promise<void> {
		try {
			await this.storage.delete(publicId);
		} catch {
			// shortcut: cleanup is best effort, add persistent retries if orphan uploads need guaranteed removal.
			console.error('[Boards] Background cleanup failed');
		}
	}
}
