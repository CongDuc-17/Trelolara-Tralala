import { prisma as database, type DatabaseClient } from '../database';
import { Prisma, Notifications } from '@prisma/client';
export class NotificationsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async createOne(data: Prisma.NotificationsCreateInput): Promise<Notifications> {
		return this.prismaService.notifications.create({
			data,
		});
	}

	async findById(id: string): Promise<Notifications | null> {
		return this.prismaService.notifications.findUnique({
			where: { id },
		});
	}

	async findManyByUserId(params: {
		userId: string;
		isRead?: boolean;
		skip?: number;
		take?: number;
	}): Promise<[Notifications[], number]> {
		const { userId, isRead, skip = 0, take = 10 } = params;

		const where: Prisma.NotificationsWhereInput = {
			userId,
			...(typeof isRead === 'boolean' ? { isRead } : {}),
		};

		const [notifications, total] = await Promise.all([
			this.prismaService.notifications.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take,
			}),
			this.prismaService.notifications.count({ where }),
		]);

		return [notifications, total];
	}

	async countUnreadByUserId(userId: string): Promise<number> {
		return this.prismaService.notifications.count({
			where: {
				userId,
				isRead: false,
			},
		});
	}

	async markAsRead(
		notificationId: string,
		userId: string,
	): Promise<Notifications | null> {
		const notification = await this.prismaService.notifications.findFirst({
			where: {
				id: notificationId,
				userId,
			},
		});

		if (!notification) return null;

		return this.prismaService.notifications.update({
			where: { id: notificationId },
			data: {
				isRead: true,
				readAt: new Date(),
			},
		});
	}
	async markAllAsRead(userId: string): Promise<void> {
		await this.prismaService.notifications.updateMany({
			where: {
				userId,
				isRead: false,
			},
			data: {
				isRead: true,
				readAt: new Date(),
			},
		});
	}
}
