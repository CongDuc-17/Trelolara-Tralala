import {
	boards,
	invitations,
	InvitationStatusEnum,
	projects,
	users,
} from '@prisma/client';

import { prisma as database, runInTransaction, type DatabaseClient } from '../database';

export type InvitationWithOwner = invitations & {
	owner?: users | null;
	project?: projects | null;
	board?: boards | null;
};
export class InvitationsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
		return runInTransaction(work, this.prismaService);
	}

	async create(data: {
		projectId?: string;
		boardId?: string;
		email: string;
		token: string;
		roleId: string;
		inviterId: string;
		expiresAt: Date;
	}): Promise<invitations> {
		return this.prismaService.invitations.create({
			data: {
				projectId: data.projectId,
				boardId: data.boardId,
				email: data.email,
				token: data.token,
				roleId: data.roleId,
				createdBy: data.inviterId,
				expiresAt: data.expiresAt,
			},
		});
	}

	async findByToken(token: string): Promise<InvitationWithOwner | null> {
		return this.prismaService.invitations.findUnique({
			where: { token },
			include: {
				project: true,
				board: true,
				owner: true,
			},
		});
	}

	async findPendingByEmail(
		email: string,
		projectId?: string,
		boardId?: string,
	): Promise<invitations[]> {
		return this.prismaService.invitations.findMany({
			where: {
				email,
				status: InvitationStatusEnum.PENDING,
				expiresAt: { gt: new Date() },
				...(projectId ? { projectId } : {}),
				...(boardId ? { boardId } : {}),
			},
			include: {
				project: true,
				board: true,
				owner: true,
			},
		});
	}

	async updateStatus(id: string, status: InvitationStatusEnum) {
		return this.prismaService.invitations.update({
			where: { id },
			data: {
				status,
				...(status === InvitationStatusEnum.ACCEPTED
					? { acceptedAt: new Date() }
					: {}),
			},
		});
	}

	async deleteById(id: string) {
		return this.prismaService.invitations.delete({
			where: { id },
		});
	}

	async checkDuplicateInvitation(params: {
		email: string;
		projectId?: string;
		boardId?: string;
	}) {
		return this.prismaService.invitations.findFirst({
			where: {
				email: params.email,
				...(params.projectId ? { projectId: params.projectId } : {}),
				...(params.boardId ? { boardId: params.boardId } : {}),
				status: InvitationStatusEnum.PENDING,
				expiresAt: { gt: new Date() },
			},
		});
	}
	async createShareLink(data: {
		projectId?: string;
		boardId?: string;
		token: string;
		roleId: string;
		inviterId: string;
		expiresAt: Date;
	}): Promise<invitations> {
		return this.prismaService.invitations.create({
			data: {
				projectId: data.projectId,
				boardId: data.boardId,
				email: '', // Empty cho shared link
				token: data.token,
				roleId: data.roleId,
				createdBy: data.inviterId,
				expiresAt: data.expiresAt,
				type: 'LINK', // NEW
			},
		});
	}
}
