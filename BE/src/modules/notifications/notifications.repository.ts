import { Prisma } from '@prisma/client';

import { prisma as database, type DatabaseClient } from '../database';

import type {
	CreateNotificationInput,
	NotificationPage,
	NotificationRecord,
} from './notifications.types';

export class NotificationsRepository {
	constructor(private readonly client: DatabaseClient = database) {}

	createOne(
		input: CreateNotificationInput,
		client: DatabaseClient = this.client,
	): Promise<NotificationRecord> {
		const { recipientUserId, ...data } = input;
		return client.notifications.create({
			data: { ...data, userId: recipientUserId },
		});
	}

	async findManyByUserId(params: {
		userId: string;
		isRead?: boolean;
		skip: number;
		take: number;
	}): Promise<NotificationPage> {
		const { userId, isRead, skip, take } = params;
		const where: Prisma.NotificationsWhereInput = {
			userId,
			...(typeof isRead === 'boolean' ? { isRead } : {}),
		};
		const [items, total] = await Promise.all([
			this.client.notifications.findMany({
				where,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				skip,
				take,
			}),
			this.client.notifications.count({ where }),
		]);
		return { items, total };
	}

	countUnreadByUserId(userId: string): Promise<number> {
		return this.client.notifications.count({ where: { userId, isRead: false } });
	}

	async markAsRead(notificationId: string, userId: string): Promise<boolean> {
		const result = await this.client.notifications.updateMany({
			where: { id: notificationId, userId, isRead: false },
			data: { isRead: true, readAt: new Date() },
		});
		if (result.count > 0) return true;

		// An already-read notification is a successful retry; preserve its readAt.
		return (
			(await this.client.notifications.findFirst({
				where: { id: notificationId, userId },
				select: { id: true },
			})) !== null
		);
	}

	async markAllAsRead(userId: string): Promise<void> {
		await this.client.notifications.updateMany({
			where: { userId, isRead: false },
			data: { isRead: true, readAt: new Date() },
		});
	}
}
