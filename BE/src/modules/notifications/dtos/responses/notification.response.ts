import { z } from 'zod';
import type { NotificationRecord } from '../../notifications.types';
export class NotificationResponseDto {
	id: string;
	type: string;
	title: string;
	content: string;
	entityType: string;
	entityId: string;
	metadata?: unknown;
	isRead: boolean;
	readAt?: Date;
	createdAt: Date;

	constructor(notification: NotificationRecord) {
		this.id = notification.id;
		this.type = notification.type;
		this.title = notification.title;
		this.content = notification.content;
		this.entityType = notification.entityType ?? '';
		this.entityId = notification.entityId ?? '';
		this.metadata = notification.metadata ?? undefined;
		this.isRead = notification.isRead;
		this.readAt = notification.readAt ?? undefined;
		this.createdAt = notification.createdAt;
	}
}

export const NotificationResponseDtoSchema = z.object({
	id: z.string(),
	type: z.string(),
	title: z.string(),
	content: z.string(),
	entityType: z.string(),
	entityId: z.string(),
	metadata: z.unknown().optional(),
	isRead: z.boolean(),
	readAt: z.date().optional(),
	createdAt: z.date(),
});

export const unreadCountResponseSchema = z.object({
	count: z.number(),
});
