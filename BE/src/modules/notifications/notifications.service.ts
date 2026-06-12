import { Notifications, Prisma } from '@prisma/client';

import {
	HttpResponseBodySuccessDto,
	NotFoundException,
	PaginationDto,
	PaginationUtils,
} from '@/common';
import { UserInformationDto } from '@/modules/users/dtos';

import {
	GetNotificationsRequestDto,
	NotificationResponseDto,
	UnreadCountResponseDto,
} from './dtos';
import {
	NotificationEntityTypeEnum,
	NotificationTypeEnum,
} from './notifications.constants';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsSocketService } from './notifiactions.socket.service';

interface CreateNotificationPayload {
	recipientUserId: string;
	actorId?: string;
	type: NotificationTypeEnum;
	title: string;
	content: string;
	entityType: NotificationEntityTypeEnum;
	entityId: string;
	metadata?: Prisma.InputJsonValue;
}

interface NotifyCardAssignedInput {
	recipientUserId: string;
	actorId: string;
	actorName: string;
	cardId: string;
	cardTitle: string;
	boardId: string;
	listId: string;
}
interface NotifyProjectInvitedInput {
	recipientUserId: string;
	actorId?: string;
	actorName: string;
	projectId: string;
	projectName: string;
}

interface NotifyBoardInvitedInput {
	recipientUserId: string;
	actorId?: string;
	actorName: string;
	boardId: string;
	boardName: string;
}

interface NotifyCardCommentedInput {
	recipientUserId: string;
	actorId: string;
	actorName: string;
	cardId: string;
	cardTitle: string;
	content: string;
	boardId: string;
}

export class NotificationsService {
	constructor(
		private readonly notificationsRepository: NotificationsRepository = new NotificationsRepository(),
		private readonly notificationsSocketService: NotificationsSocketService = new NotificationsSocketService(),
	) {}

	async getMyNotifications(
		user: UserInformationDto,
		query: GetNotificationsRequestDto,
		pagination: PaginationDto,
	): Promise<HttpResponseBodySuccessDto<NotificationResponseDto[]>> {
		const paginationUtils = new PaginationUtils().extractSkipTakeFromPagination(
			pagination,
		);

		const [notifications, total] =
			await this.notificationsRepository.findManyByUserId({
				userId: user.id,
				isRead: query.isRead,
				skip: paginationUtils.skip,
				take: paginationUtils.take,
			});

		return {
			success: true,
			data: notifications.map((item) => new NotificationResponseDto(item)),
			pagination:
				paginationUtils.convertPaginationResponseDtoFromTotalRecords(total),
		};
	}

	async getMyUnreadCount(
		user: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<UnreadCountResponseDto>> {
		const count = await this.notificationsRepository.countUnreadByUserId(user.id);

		return {
			success: true,
			data: new UnreadCountResponseDto(count),
		};
	}

	async markAsRead(
		notificationId: string,
		user: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const updated = await this.notificationsRepository.markAsRead(
			notificationId,
			user.id,
		);

		if (!updated) {
			throw new NotFoundException('Notification not found');
		}

		return {
			success: true,
			data: null,
		};
	}

	async markAllAsRead(
		user: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<null>> {
		await this.notificationsRepository.markAllAsRead(user.id);

		return {
			success: true,
			data: null,
		};
	}

	private async createNotification(
		payload: CreateNotificationPayload,
	): Promise<Notifications> {
		const data: Prisma.NotificationsCreateInput = {
			user: {
				connect: {
					id: payload.recipientUserId,
				},
			},
			actorId: payload.actorId,
			type: payload.type,
			title: payload.title,
			content: payload.content,
			entityType: payload.entityType,
			entityId: payload.entityId,
			metadata: payload.metadata,
		};

		const notification = await this.notificationsRepository.createOne(data);
		const unreadCount = await this.notificationsRepository.countUnreadByUserId(
			payload.recipientUserId,
		);

		this.notificationsSocketService.emitNewNotification(
			payload.recipientUserId,
			new NotificationResponseDto(notification),
		);

		this.notificationsSocketService.emitUnreadCount(
			payload.recipientUserId,
			unreadCount,
		);
		return notification;
	}

	async notifyProjectInvited(input: NotifyProjectInvitedInput): Promise<Notifications> {
		return this.createNotification({
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
			},
		});
	}
	async notifyBoardInvited(input: NotifyBoardInvitedInput): Promise<Notifications> {
		return this.createNotification({
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
			},
		});
	}

	async notifyCardAssigned(input: NotifyCardAssignedInput): Promise<Notifications> {
		return this.createNotification({
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
		});
	}

	async notifyCardCommented(input: NotifyCardCommentedInput): Promise<Notifications> {
		return this.createNotification({
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
		});
	}
}
