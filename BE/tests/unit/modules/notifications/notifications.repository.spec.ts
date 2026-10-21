import type { DatabaseClient } from '@/modules/database';
import {
	NotificationEntityTypeEnum,
	NotificationTypeEnum,
} from '@/modules/notifications/notifications.constants';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';

import { notification } from './notifications.fixture';

function setup() {
	const records = [{ ...notification }];
	const model = {
		create: jest.fn(async () => notification),
		findMany: jest.fn(async () => records),
		count: jest.fn(async () => records.length),
		findFirst: jest.fn(
			async ({ where }: { where: { id: string; userId: string } }) =>
				records.find(
					(record) => record.id === where.id && record.userId === where.userId,
				) ?? null,
		),
		updateMany: jest.fn(
			async ({
				where,
				data,
			}: {
				where: { id?: string; userId: string; isRead: boolean };
				data: { isRead: boolean; readAt: Date };
			}) => {
				const matches = records.filter(
					(record) =>
						(!where.id || record.id === where.id) &&
						record.userId === where.userId &&
						record.isRead === where.isRead,
				);
				matches.forEach((record) => Object.assign(record, data));
				return { count: matches.length };
			},
		),
	};
	return {
		repository: new NotificationsRepository({
			notifications: model,
		} as unknown as DatabaseClient),
		model,
		records,
	};
}

describe('Notifications persistence with an isolated database adapter', () => {
	it('persists through the caller transaction instead of the default client', async () => {
		const { repository, model } = setup();
		const create = jest.fn(async () => notification);
		const transaction = { notifications: { create } } as unknown as DatabaseClient;
		const input = {
			recipientUserId: notification.userId,
			actorId: 'actor-1',
			type: NotificationTypeEnum.CARD_ASSIGNED,
			title: notification.title,
			content: notification.content,
			entityType: NotificationEntityTypeEnum.CARD,
			entityId: 'card-1',
			metadata: { cardId: 'card-1' },
		};
		await expect(repository.createOne(input, transaction)).resolves.toEqual(
			notification,
		);
		expect(model.create).not.toHaveBeenCalled();
		expect(create).toHaveBeenCalledWith({
			data: {
				userId: notification.userId,
				actorId: input.actorId,
				type: input.type,
				title: input.title,
				content: input.content,
				entityType: input.entityType,
				entityId: input.entityId,
				metadata: input.metadata,
			},
		});
	});

	it('uses the same unread filter for data/count and deterministic pagination', async () => {
		const { repository, model } = setup();
		await expect(
			repository.findManyByUserId({
				userId: 'recipient-1',
				isRead: false,
				skip: 10,
				take: 5,
			}),
		).resolves.toEqual({ items: [notification], total: 1 });
		expect(model.findMany).toHaveBeenCalledWith({
			where: { userId: 'recipient-1', isRead: false },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			skip: 10,
			take: 5,
		});
		expect(model.count).toHaveBeenCalledWith({
			where: { userId: 'recipient-1', isRead: false },
		});
	});

	it('scopes the write by owner and rejects another user without changing the record', async () => {
		const { repository, model, records } = setup();
		await expect(repository.markAsRead(notification.id, 'outsider')).resolves.toBe(
			false,
		);
		expect(model.updateMany).toHaveBeenCalledWith({
			where: { id: notification.id, userId: 'outsider', isRead: false },
			data: { isRead: true, readAt: expect.any(Date) },
		});
		expect(records[0].isRead).toBe(false);
	});

	it('keeps the first readAt on repeated and concurrent read requests', async () => {
		const { repository, records } = setup();
		await expect(
			repository.markAsRead(notification.id, notification.userId),
		).resolves.toBe(true);
		const firstReadAt = records[0].readAt;
		await expect(
			Promise.all([
				repository.markAsRead(notification.id, notification.userId),
				repository.markAsRead(notification.id, notification.userId),
			]),
		).resolves.toEqual([true, true]);
		expect(records[0].readAt).toBe(firstReadAt);
	});

	it('mark-all updates only the actor unread records and preserves previously read timestamps', async () => {
		const { repository, records, model } = setup();
		const earlier = new Date('2026-10-20T00:00:00Z');
		records.push({
			...notification,
			id: 'already-read',
			isRead: true,
			readAt: earlier,
		});
		records.push({ ...notification, id: 'other-user', userId: 'other-user' });
		await repository.markAllAsRead(notification.userId);
		expect(model.updateMany).toHaveBeenCalledWith({
			where: { userId: notification.userId, isRead: false },
			data: { isRead: true, readAt: expect.any(Date) },
		});
		expect(records[0].isRead).toBe(true);
		expect(records[1].readAt).toBe(earlier);
		expect(records[2].isRead).toBe(false);
	});
});
