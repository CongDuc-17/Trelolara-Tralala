import { NotFoundException } from '@/common/exceptions';
import type { DatabaseClient } from '../database';

import {
	NotificationEntityTypeEnum,
	NotificationTypeEnum,
} from './notifications.constants';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsSocketService } from './notification.socket';
import type {
	BoardInvitedInput,
	CardAssignedInput,
	CardCommentedInput,
	ListNotificationsInput,
	NotificationPage,
	NotificationRecord,
	ProjectInvitedInput,
} from './notifications.types';

export class NotificationsService {
	constructor(
		private readonly repository = new NotificationsRepository(),
		private readonly socket = new NotificationsSocketService(),
	) {}

	getMyNotifications(
		userId: string,
		query: ListNotificationsInput,
	): Promise<NotificationPage> {
		return this.repository.findManyByUserId({
			userId,
			isRead: query.isRead,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		});
	}

	getMyUnreadCount(userId: string): Promise<number> {
		return this.repository.countUnreadByUserId(userId);
	}

	async markAsRead(notificationId: string, userId: string): Promise<void> {
		if (!(await this.repository.markAsRead(notificationId, userId))) {
			throw new NotFoundException('Notification not found');
		}
	}

	markAllAsRead(userId: string): Promise<void> {
		return this.repository.markAllAsRead(userId);
	}

	// Call only after the transaction commits; delivery cannot roll back saved work.
	async deliver(
		notifications: NotificationRecord | NotificationRecord[],
	): Promise<boolean> {
		const records = Array.isArray(notifications) ? notifications : [notifications];
		let delivered = true;
		for (const record of records) {
			try {
				this.socket.emitNewNotification(record.userId, record);
			} catch {
				delivered = false;
				console.warn('Notification event delivery failed');
			}
		}
		for (const userId of new Set(records.map((record) => record.userId))) {
			try {
				const count = await this.repository.countUnreadByUserId(userId);
				this.socket.emitUnreadCount(userId, count);
			} catch {
				delivered = false;
				console.warn('Notification unread count delivery failed');
			}
		}
		return delivered;
	}

	persistProjectInvited(
		input: ProjectInvitedInput,
		client?: DatabaseClient,
	): Promise<NotificationRecord> {
		return this.repository.createOne(
			{
				recipientUserId: input.recipientUserId,
				actorId: input.actorId,
				type: NotificationTypeEnum.PROJECT_INVITED,
				title: 'You were invited to a project',
				content: `${input.actorName} invited you to project ${input.projectName}`,
				entityType: NotificationEntityTypeEnum.PROJECT,
				entityId: input.projectId,
				metadata: {
					projectId: input.projectId,
					projectName: input.projectName,
					actorName: input.actorName,
					...(input.invitation
						? {
								invitationId: input.invitation.id,
								token: input.invitation.token,
								type: input.invitation.type,
								expiresAt: input.invitation.expiresAt,
							}
						: {}),
				},
			},
			client,
		);
	}

	persistBoardInvited(
		input: BoardInvitedInput,
		client?: DatabaseClient,
	): Promise<NotificationRecord> {
		return this.repository.createOne(
			{
				recipientUserId: input.recipientUserId,
				actorId: input.actorId,
				type: NotificationTypeEnum.BOARD_INVITED,
				title: 'You were invited to a board',
				content: `${input.actorName} invited you to board ${input.boardName}`,
				entityType: NotificationEntityTypeEnum.BOARD,
				entityId: input.boardId,
				metadata: {
					boardId: input.boardId,
					boardName: input.boardName,
					actorName: input.actorName,
					...(input.invitation
						? {
								invitationId: input.invitation.id,
								token: input.invitation.token,
								type: input.invitation.type,
								expiresAt: input.invitation.expiresAt,
							}
						: {}),
				},
			},
			client,
		);
	}

	persistCardAssigned(
		input: CardAssignedInput,
		client?: DatabaseClient,
	): Promise<NotificationRecord> {
		return this.repository.createOne(
			{
				recipientUserId: input.recipientUserId,
				actorId: input.actorId,
				type: NotificationTypeEnum.CARD_ASSIGNED,
				title: 'You were assigned to a card',
				content: `${input.actorName} assigned you to card ${input.cardTitle}`,
				entityType: NotificationEntityTypeEnum.CARD,
				entityId: input.cardId,
				metadata: {
					boardId: input.boardId,
					listId: input.listId,
					cardId: input.cardId,
					cardTitle: input.cardTitle,
					actorName: input.actorName,
				},
			},
			client,
		);
	}

	persistCardCommented(
		input: CardCommentedInput,
		client?: DatabaseClient,
	): Promise<NotificationRecord> {
		return this.repository.createOne(
			{
				recipientUserId: input.recipientUserId,
				actorId: input.actorId,
				type: NotificationTypeEnum.CARD_COMMENTED,
				title: 'New comment on a card you follow',
				content: `${input.actorName} commented on card ${input.cardTitle}: "${input.content}"`,
				entityType: NotificationEntityTypeEnum.CARD,
				entityId: input.cardId,
				metadata: {
					cardId: input.cardId,
					cardTitle: input.cardTitle,
					actorName: input.actorName,
					commentContent: input.content,
					boardId: input.boardId,
				},
			},
			client,
		);
	}
}
