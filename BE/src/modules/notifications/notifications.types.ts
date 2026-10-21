import type {
	NotificationEntityTypeEnum,
	NotificationTypeEnum,
} from './notifications.constants';

export interface NotificationRecord {
	id: string;
	userId: string;
	actorId: string | null;
	type: string;
	title: string;
	content: string;
	entityType: string | null;
	entityId: string | null;
	metadata: unknown;
	isRead: boolean;
	readAt: Date | null;
	createdAt: Date;
}

export interface CreateNotificationInput {
	recipientUserId: string;
	actorId?: string;
	type: NotificationTypeEnum;
	title: string;
	content: string;
	entityType: NotificationEntityTypeEnum;
	entityId: string;
	metadata: Record<string, string>;
}

export interface ListNotificationsInput {
	page: number;
	limit: number;
	isRead?: boolean;
}

export interface NotificationPage {
	items: NotificationRecord[];
	total: number;
}

export interface ProjectInvitedInput {
	invitation?: { id: string; token: string; type: string; expiresAt: string };
	recipientUserId: string;
	actorId?: string;
	actorName: string;
	projectId: string;
	projectName: string;
}

export interface BoardInvitedInput {
	invitation?: { id: string; token: string; type: string; expiresAt: string };
	recipientUserId: string;
	actorId?: string;
	actorName: string;
	boardId: string;
	boardName: string;
}

export interface CardAssignedInput {
	recipientUserId: string;
	actorId: string;
	actorName: string;
	cardId: string;
	cardTitle: string;
	boardId: string;
	listId: string;
}

export interface CardCommentedInput {
	recipientUserId: string;
	actorId: string;
	actorName: string;
	cardId: string;
	cardTitle: string;
	content: string;
	boardId: string;
}
