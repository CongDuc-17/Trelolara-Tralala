import { prisma, runInTransaction, type DatabaseClient } from '../database';
import { BoardsRepository } from '../boards/boards.repository';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import type { NotificationRecord } from '../notifications/notifications.types';
import type {
	InvitationRecord,
	InvitationScope,
	InvitationTarget,
	InvitationStatus,
	InvitationType,
	InvitationUser,
	InvitationRole,
} from './invitations.types';

export class InvitationsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	inTransaction<T>(
		work: (repository: InvitationsRepository, client: DatabaseClient) => Promise<T>,
	): Promise<T> {
		return runInTransaction(
			(client) => work(new InvitationsRepository(client), client),
			this.client,
		);
	}
	async lockTarget(scope: InvitationScope, id: string): Promise<void> {
		if (scope === 'board') await new BoardsRepository(this.client).lockBoard(id);
		else
			await this.client
				.$queryRaw`SELECT id FROM "Projects" WHERE id = ${id} FOR UPDATE`;
	}
	async lockInvitation(id: string): Promise<void> {
		await this.client
			.$queryRaw`SELECT id FROM "Invitations" WHERE id = ${id} FOR UPDATE`;
	}
	async lockUser(id: string): Promise<void> {
		await this.client.$queryRaw`SELECT id FROM "Users" WHERE id = ${id} FOR UPDATE`;
	}
	async getTarget(
		scope: InvitationScope,
		id: string,
	): Promise<InvitationTarget | null> {
		const row =
			scope === 'project'
				? await this.client.projects.findUnique({
						where: { id },
						select: { id: true, name: true, status: true, deletedAt: true },
					})
				: await this.client.boards.findUnique({
						where: { id },
						select: {
							id: true,
							name: true,
							status: true,
							deletedAt: true,
							project: { select: { status: true, deletedAt: true } },
						},
					});
		return row ? { ...row, scope } : null;
	}
	findUser(input: { id?: string; email?: string }): Promise<InvitationUser | null> {
		return this.client.users.findFirst({
			where: {
				id: input.id,
				...(input.email
					? { email: { equals: input.email, mode: 'insensitive' } }
					: {}),
			},
			select: {
				id: true,
				name: true,
				email: true,
				verify: true,
				status: true,
				deletedAt: true,
			},
		});
	}
	findRole(scope: InvitationScope, id?: string): Promise<InvitationRole | null> {
		return this.client.roles.findFirst({
			where: id ? { id } : { name: scope.toUpperCase() + '_MEMBER' },
			select: { id: true, name: true, status: true, deletedAt: true },
		});
	}
	canInvite(
		scope: InvitationScope,
		targetId: string,
		actorId: string,
	): Promise<boolean> {
		const permissions = new PermissionService(new PermissionsRepository(this.client));
		return scope === 'project'
			? permissions.hasProjectPermission(actorId, targetId, ['INVITE_MEMBER'])
			: permissions.hasBoardPermission(actorId, targetId, ['INVITE_MEMBER']);
	}
	isAdmin(scope: InvitationScope, targetId: string, actorId: string): Promise<boolean> {
		const permissions = new PermissionService(new PermissionsRepository(this.client));
		return scope === 'project'
			? permissions.hasProjectAdmin(actorId, targetId)
			: permissions.hasBoardAdmin(actorId, targetId);
	}
	findMember(
		scope: InvitationScope,
		targetId: string,
		userId: string,
	): Promise<{ id: string } | null> {
		return scope === 'project'
			? this.client.projectMembers.findFirst({
					where: { projectId: targetId, userId },
					select: { id: true },
				})
			: this.client.boardMembers.findFirst({
					where: { boardId: targetId, userId },
					select: { id: true },
				});
	}
	async createMember(
		scope: InvitationScope,
		targetId: string,
		userId: string,
		roleId: string,
	): Promise<void> {
		if (scope === 'project')
			await this.client.projectMembers.create({
				data: { projectId: targetId, userId, roleId, accepted: true },
			});
		else
			await this.client.boardMembers.create({
				data: { boardId: targetId, userId, roleId, accepted: true },
			});
	}
	create(data: {
		projectId?: string;
		boardId?: string;
		email: string;
		token: string;
		roleId: string;
		createdBy: string;
		expiresAt: Date;
		type: InvitationType;
	}): Promise<InvitationRecord> {
		return this.client.invitations.create({ data });
	}
	findByToken(token: string): Promise<InvitationRecord | null> {
		return this.client.invitations.findUnique({ where: { token } });
	}
	findPendingByEmail(
		email: string,
		scope: InvitationScope,
		targetId: string,
	): Promise<InvitationRecord[]> {
		return this.client.invitations.findMany({
			where: {
				email: { equals: email, mode: 'insensitive' },
				type: 'EMAIL',
				status: 'PENDING',
				expiresAt: { gt: new Date() },
				...(scope === 'project'
					? { projectId: targetId, boardId: null }
					: { boardId: targetId, projectId: null }),
			},
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		});
	}
	updateStatus(id: string, status: InvitationStatus): Promise<InvitationRecord> {
		return this.client.invitations.update({
			where: { id },
			data: {
				status,
				...(status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
			},
		});
	}
	findNotification(
		invitationId: string,
		userId: string,
	): Promise<NotificationRecord | null> {
		return this.client.notifications.findFirst({
			where: { userId, metadata: { path: ['invitationId'], equals: invitationId } },
		});
	}
}
