import { BoardStatusEnum } from '@prisma/client';
import {
	prisma as database,
	runInTransaction,
	type DatabaseClient,
} from '../database/prisma.service';

export class BoardMembersRepository {
	constructor(private readonly prisma: DatabaseClient = database) {}

	async getBoardsOfUserInProject({
		projectId,
		userId,
		status,
		skip = 0,
		take = 20,
	}: {
		projectId: string;
		userId: string;
		status?: BoardStatusEnum;
		skip: number;
		take: number;
	}) {
		return Promise.all([
			this.prisma.boardMembers.findMany({
				where: {
					userId,
					board: {
						projectId,
						status: status,
					},
				},
				skip: skip,
				take: take,
				select: {
					id: true,
					userId: true,
					boardId: true,
					role: {
						select: {
							id: true,
							name: true,
						},
					},
					board: {
						select: {
							id: true,
							name: true,
							description: true,
							background: true,
							status: true,
							_count: {
								select: {
									lists: true,
									boardMembers: true,
								},
							},
						},
					},
				},
				orderBy: [{ invitedAt: 'desc' }, { id: 'asc' }],
			}),
			this.prisma.boardMembers.count({
				where: {
					userId,
					board: {
						projectId,
						status: status,
					},
				},
			}),
		]);
	}

	async getBoardsOfUser({
		userId,
		status,
		skip = 0,
		take = 20,
	}: {
		userId: string;
		status?: BoardStatusEnum;
		skip: number;
		take: number;
	}) {
		return Promise.all([
			this.prisma.boardMembers.findMany({
				where: {
					userId,
					board: {
						status,
					},
				},
				skip,
				take,
				select: {
					id: true,
					userId: true,
					boardId: true,
					role: {
						select: {
							id: true,
							name: true,
						},
					},
					board: {
						select: {
							id: true,
							projectId: true,
							name: true,
							description: true,
							background: true,
							status: true,
							project: {
								select: {
									id: true,
									name: true,
									status: true,
								},
							},
							_count: {
								select: {
									lists: true,
									boardMembers: true,
								},
							},
						},
					},
				},
				orderBy: [{ invitedAt: 'desc' }, { id: 'asc' }],
			}),
			this.prisma.boardMembers.count({
				where: {
					userId,
					board: {
						status,
					},
				},
			}),
		]);
	}

	async assignUserRoleBoard(
		boardId: string,
		userId: string,
		roleId: string,
		client: DatabaseClient = this.prisma,
	) {
		return client.boardMembers.create({
			data: {
				boardId,
				userId,
				roleId,
			},
		});
	}

	async isUserMemberOfBoard(
		boardId: string,
		userId: string,
		client: DatabaseClient = this.prisma,
	) {
		const m = await client.boardMembers.findFirst({
			where: { boardId, userId },
			include: {
				role: {
					select: {
						id: true,
						name: true,
						status: true,
						deletedAt: true,
					},
				},
			},
		});
		return m;
	}

	async getBoardMembers(boardId: string) {
		return this.prisma.boardMembers.findMany({
			where: { boardId },
			orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						avatar: true,
					},
				},
				role: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});
	}

	async countAdministrators(
		boardId: string,
		client: DatabaseClient = this.prisma,
	): Promise<number> {
		return client.boardMembers.count({
			where: {
				boardId,
				role: { name: 'BOARD_ADMIN', status: 'ACTIVE', deletedAt: null },
			},
		});
	}

	async changeRoleOfMemberBoard(
		boardId: string,
		userId: string,
		newRoleId: string,
		client: DatabaseClient = this.prisma,
	) {
		return client.boardMembers.updateMany({
			where: { boardId, userId },
			data: { roleId: newRoleId },
		});
	}
	async removeMember(
		boardId: string,
		userId: string,
		client: DatabaseClient = this.prisma,
	) {
		return runInTransaction(async (transaction) => {
			await transaction.cardMembers.deleteMany({
				where: { userId, card: { list: { boardId } } },
			});
			return transaction.boardMembers.deleteMany({ where: { boardId, userId } });
		}, client);
	}
}
