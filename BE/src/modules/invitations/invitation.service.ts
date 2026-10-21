import { randomBytes } from 'crypto';
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import { MailsService } from '../mails/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationRecord } from '../notifications/notifications.types';
import { InvitationsRepository } from './invitation.repository';
import type {
	InvitationDelivery,
	InvitationRecord,
	InvitationScope,
	InvitationTarget,
	InvitationView,
} from './invitations.types';

export class InvitationService {
	constructor(
		private readonly repository = new InvitationsRepository(),
		private readonly notifications = new NotificationsService(),
		private readonly mails = new MailsService(),
		private readonly frontendUrl = process.env.FRONTEND_URL ??
			process.env.CORS_ORIGIN ??
			'',
	) {}
	inviteUserToProject(
		projectId: string,
		actorId: string,
		email: string,
		roleId?: string,
	): Promise<InvitationView> {
		return this.inviteEmail('project', projectId, actorId, email, roleId);
	}
	inviteUserToBoard(
		boardId: string,
		actorId: string,
		email: string,
		roleId?: string,
	): Promise<InvitationView> {
		return this.inviteEmail('board', boardId, actorId, email, roleId);
	}
	createShareLinkForProject(
		projectId: string,
		actorId: string,
		roleId?: string,
	): Promise<InvitationView> {
		return this.createLink('project', projectId, actorId, roleId);
	}
	createShareLinkForBoard(
		boardId: string,
		actorId: string,
		roleId?: string,
	): Promise<InvitationView> {
		return this.createLink('board', boardId, actorId, roleId);
	}
	async acceptInvitation(token: string, userId: string): Promise<string> {
		await this.withInvitation(token, async (invitation, target, repository) => {
			if (invitation.expiresAt.getTime() <= Date.now())
				throw new ConflictException('Invitation token has expired');
			if (
				invitation.status !== 'PENDING' &&
				!(invitation.type === 'LINK' && invitation.status === 'ACCEPTED')
			)
				throw new ConflictException('Invitation already processed');
			this.requireActive(target);
			await repository.lockUser(userId);
			const user = await repository.findUser({ id: userId });
			if (!user || user.status !== 'ACTIVE' || user.deletedAt)
				throw new ForbiddenException();
			if (!user.verify)
				throw new OptionalException(
					403,
					'Verify your email before accepting an invitation',
				);
			if (
				invitation.type === 'EMAIL' &&
				user.email.toLowerCase() !== invitation.email?.toLowerCase()
			)
				throw new ForbiddenException();
			await this.requireGrant(
				repository,
				target,
				invitation.createdBy,
				invitation.roleId,
			);
			if (await repository.findMember(target.scope, target.id, userId))
				throw new ConflictException('User is already a member');
			await repository.createMember(
				target.scope,
				target.id,
				userId,
				invitation.roleId,
			);
			if (invitation.type === 'EMAIL')
				await repository.updateStatus(invitation.id, 'ACCEPTED');
		});
		return 'Invitation accepted successfully';
	}
	async rejectInvitation(token: string, userId: string): Promise<string> {
		await this.withInvitation(token, async (invitation, target, repository) => {
			if (invitation.status === 'CANCELLED' || invitation.status === 'EXPIRED')
				throw new ConflictException('Invitation already processed');
			const user = await repository.findUser({ id: userId });
			if (!user || user.status !== 'ACTIVE' || user.deletedAt)
				throw new ForbiddenException();
			const manages =
				invitation.createdBy === userId ||
				(await repository.isAdmin(target.scope, target.id, userId));
			const recipient =
				invitation.type === 'EMAIL' &&
				invitation.status === 'PENDING' &&
				user.email.toLowerCase() === invitation.email?.toLowerCase();
			if (!manages && !recipient) throw new ForbiddenException();
			await repository.updateStatus(invitation.id, 'CANCELLED');
		});
		return 'Invitation rejected successfully';
	}
	private async inviteEmail(
		scope: InvitationScope,
		targetId: string,
		actorId: string,
		email: string,
		roleId?: string,
	): Promise<InvitationView> {
		email = email.trim().toLowerCase();
		const saved = await this.repository.inTransaction(async (repository, client) => {
			await repository.lockTarget(scope, targetId);
			const target = await this.requireTarget(repository, scope, targetId);
			this.requireActive(target);
			const { actor, role } = await this.requireGrant(
				repository,
				target,
				actorId,
				roleId,
			);
			const pending = await repository.findPendingByEmail(email, scope, targetId);
			if (pending.some((row) => row.roleId !== role.id))
				throw new ConflictException('A pending invitation has a different role');
			const recipient = await repository.findUser({ email });
			if (recipient && (await repository.findMember(scope, targetId, recipient.id)))
				throw new ConflictException('User is already a member');
			const invitation =
				pending[0] ??
				(await repository.create({
					...this.targetFields(scope, targetId),
					email,
					roleId: role.id,
					createdBy: actorId,
					token: randomBytes(32).toString('hex'),
					expiresAt: new Date(Date.now() + 7 * 86400000),
					type: 'EMAIL',
				}));
			let notification: NotificationRecord | null = null;
			if (recipient) {
				notification = await repository.findNotification(
					invitation.id,
					recipient.id,
				);
				if (!notification) {
					const invitationMetadata = {
						id: invitation.id,
						token: invitation.token,
						type: invitation.type,
						expiresAt: invitation.expiresAt.toISOString(),
					};
					notification =
						scope === 'project'
							? await this.notifications.persistProjectInvited(
									{
										recipientUserId: recipient.id,
										actorId,
										actorName: actor.name,
										projectId: targetId,
										projectName: target.name,
										invitation: invitationMetadata,
									},
									client,
								)
							: await this.notifications.persistBoardInvited(
									{
										recipientUserId: recipient.id,
										actorId,
										actorName: actor.name,
										boardId: targetId,
										boardName: target.name,
										invitation: invitationMetadata,
									},
									client,
								);
				}
			}
			return { invitation, notification, target };
		});
		const delivery: InvitationDelivery = {
			email: 'SENT',
			notification: 'NOT_APPLICABLE',
		};
		if (saved.notification) {
			try {
				delivery.notification = (await this.notifications.deliver(
					saved.notification,
				))
					? 'SENT'
					: 'FAILED';
			} catch {
				delivery.notification = 'FAILED';
			}
		}
		try {
			const url = this.shareUrl(saved.target.scope, saved.invitation.token);
			await this.mails.sendEmail({
				recipients: [email],
				subject: 'Invitation to ' + saved.target.name,
				text:
					'You have been invited to ' +
					saved.target.name +
					'. Sign in with ' +
					email +
					', verify your email, then accept: ' +
					url +
					'\nExpires: ' +
					saved.invitation.expiresAt.toISOString(),
			});
		} catch {
			delivery.email = 'FAILED';
		}
		return this.view(saved.invitation, delivery);
	}
	private async createLink(
		scope: InvitationScope,
		targetId: string,
		actorId: string,
		roleId?: string,
	): Promise<InvitationView> {
		const token = randomBytes(32).toString('hex');
		const shareUrl = this.shareUrl(scope, token);
		const invitation = await this.repository.inTransaction(async (repository) => {
			await repository.lockTarget(scope, targetId);
			const target = await this.requireTarget(repository, scope, targetId);
			this.requireActive(target);
			const { role } = await this.requireGrant(repository, target, actorId, roleId);
			return repository.create({
				...this.targetFields(scope, targetId),
				email: '',
				roleId: role.id,
				createdBy: actorId,
				token,
				expiresAt: new Date(Date.now() + 30 * 86400000),
				type: 'LINK',
			});
		});
		return {
			...this.view(invitation, {
				email: 'NOT_APPLICABLE',
				notification: 'NOT_APPLICABLE',
			}),
			shareUrl,
		};
	}
	private async withInvitation<T>(
		token: string,
		work: (
			invitation: InvitationRecord,
			target: InvitationTarget,
			repository: InvitationsRepository,
		) => Promise<T>,
	): Promise<T> {
		return this.repository.inTransaction(async (repository) => {
			const initial = await repository.findByToken(token);
			if (!initial) throw new NotFoundException('Invitation not found');
			if (Boolean(initial.projectId) === Boolean(initial.boardId))
				throw new OptionalException(
					422,
					'Invitation must have exactly one target',
				);
			const scope = initial.projectId ? 'project' : 'board';
			const targetId = (initial.projectId ?? initial.boardId)!;
			await repository.lockTarget(scope, targetId);
			await repository.lockInvitation(initial.id);
			const invitation = await repository.findByToken(token);
			if (!invitation) throw new NotFoundException('Invitation not found');
			const target = await this.requireTarget(repository, scope, targetId);
			return work(invitation, target, repository);
		});
	}
	private async requireTarget(
		repository: InvitationsRepository,
		scope: InvitationScope,
		id: string,
	): Promise<InvitationTarget> {
		const target = await repository.getTarget(scope, id);
		if (!target) throw new NotFoundException('Invitation target not found');
		return target;
	}
	private requireActive(target: InvitationTarget): void {
		if (
			target.status !== 'ACTIVE' ||
			target.deletedAt ||
			(target.project &&
				(target.project.status !== 'ACTIVE' || target.project.deletedAt))
		)
			throw new OptionalException(409, 'Invitation target is read-only');
	}
	private async requireGrant(
		repository: InvitationsRepository,
		target: InvitationTarget,
		actorId: string,
		roleId?: string,
	) {
		const actor = await repository.findUser({ id: actorId });
		if (!actor || actor.status !== 'ACTIVE' || actor.deletedAt)
			throw new ForbiddenException();
		const role = await repository.findRole(target.scope, roleId);
		const prefix = target.scope.toUpperCase() + '_';
		if (
			!role ||
			role.status !== 'ACTIVE' ||
			role.deletedAt ||
			!role.name.startsWith(prefix)
		)
			throw new OptionalException(422, 'Role does not belong to this scope');
		if (!(await repository.canInvite(target.scope, target.id, actorId)))
			throw new ForbiddenException();
		if (
			![prefix + 'MEMBER', prefix + 'VIEWER'].includes(role.name) &&
			!(await repository.isAdmin(target.scope, target.id, actorId))
		)
			throw new ForbiddenException();
		return { actor, role };
	}
	private targetFields(
		scope: InvitationScope,
		id: string,
	): { projectId?: string; boardId?: string } {
		return scope === 'project' ? { projectId: id } : { boardId: id };
	}
	private shareUrl(scope: InvitationScope, token: string): string {
		const base = new URL(this.frontendUrl);
		if (
			!['https:', 'http:'].includes(base.protocol) ||
			base.username ||
			base.password ||
			base.search ||
			base.hash
		)
			throw new Error('Invalid frontend URL');
		return (
			this.frontendUrl.replace(/\/$/, '') +
			'/invite/' +
			(scope === 'project' ? 'projects/' : 'boards/') +
			token
		);
	}
	private view(row: InvitationRecord, delivery: InvitationDelivery): InvitationView {
		return {
			id: row.id,
			token: row.token,
			email: row.email ?? '',
			projectId: row.projectId ?? undefined,
			boardId: row.boardId ?? undefined,
			roleId: row.roleId,
			inviterId: row.createdBy,
			type: row.type,
			status: row.status,
			expiresAt: row.expiresAt,
			delivery,
		};
	}
}
