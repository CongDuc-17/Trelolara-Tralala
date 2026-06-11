import { BoardStatusEnum } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export class BoardMembersRepository {
	constructor(private readonly prisma = new PrismaService()) {}

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
				orderBy: {
					invitedAt: 'desc',
				},
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
				orderBy: {
					invitedAt: 'desc',
				},
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

	async assignUserRoleBoard(boardId: string, userId: string, roleId: string) {
		return this.prisma.boardMembers.create({
			data: {
				boardId,
				userId,
				roleId,
			},
		});
	}

	async isUserMemberOfBoard(boardId: string, userId: string) {
		const m = await this.prisma.boardMembers.findFirst({
			where: { boardId, userId },
			include: {
				role: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});
		return m;
	}

	async getBoardMembers(boardId: string) {
		return this.prisma.boardMembers.findMany({
			where: { boardId },
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

	async changeRoleOfMemberBoard(boardId: string, userId: string, newRoleId: string) {
		return this.prisma.boardMembers.updateMany({
			where: { boardId, userId },
			data: { roleId: newRoleId },
		});
	}
	async removeMember(boardId: string, userId: string) {
		await this.prisma.cardMembers.deleteMany({
			where: { userId },
		});

		return this.prisma.boardMembers.deleteMany({
			where: { boardId, userId },
		});
	}
}
