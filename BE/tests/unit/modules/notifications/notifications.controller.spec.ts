import type { Request, Response } from 'express';

import { NotificationsController } from '@/modules/notifications/notifications.controller';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
	getNotificationsRequestSchema,
	markNotificationRequestSchema,
} from '@/modules/notifications/dtos';

import { notification } from './notifications.fixture';

jest.mock('@/socket/socket.server', () => ({ sendToUser: jest.fn() }));

function setup() {
	const service = {
		getMyNotifications: jest.fn(async () => ({ items: [notification], total: 11 })),
		getMyUnreadCount: jest.fn(async () => 3),
		markAsRead: jest.fn(async () => undefined),
		markAllAsRead: jest.fn(async () => undefined),
	};
	const response = {
		locals: {
			validated: {
				query: { page: 2, limit: 5, isRead: false },
				params: { notificationId: notification.id },
			},
		},
		status: jest.fn(),
		json: jest.fn(),
	};
	response.status.mockReturnValue(response);
	response.json.mockReturnValue(response);
	const request = { user: { id: notification.userId } } as unknown as Request;
	return {
		controller: new NotificationsController(
			service as unknown as NotificationsService,
		),
		service,
		request,
		response,
	};
}

describe('Notification HTTP contracts', () => {
	it('parses false explicitly and rejects invalid filters and pagination', () => {
		const schema = getNotificationsRequestSchema.query;
		expect(schema.parse({ isRead: 'false' })).toEqual({
			page: 1,
			limit: 10,
			isRead: false,
		});
		expect(schema.parse({ isRead: 'true', page: '2', limit: '5' })).toEqual({
			page: 2,
			limit: 5,
			isRead: true,
		});
		for (const value of [
			{ isRead: 'yes' },
			{ isRead: ['true', 'false'] },
			{ page: '0' },
			{ page: '1.5' },
			{ limit: '-1' },
			{ limit: 'NaN' },
		]) {
			expect(schema.safeParse(value).success).toBe(false);
		}
		expect(
			markNotificationRequestSchema.params.safeParse({ notificationId: 'invalid' })
				.success,
		).toBe(false);
	});

	it('keeps the 200 success envelope, safe notification fields and existing pagination names', async () => {
		const { controller, service, request, response } = setup();
		await controller.getMyNotifications(request, response as unknown as Response);
		expect(service.getMyNotifications).toHaveBeenCalledWith(notification.userId, {
			page: 2,
			limit: 5,
			isRead: false,
		});
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: [
				{
					id: notification.id,
					type: notification.type,
					title: notification.title,
					content: notification.content,
					entityType: 'CARD',
					entityId: 'card-1',
					metadata: notification.metadata,
					isRead: false,
					readAt: undefined,
					createdAt: notification.createdAt,
				},
			],
			pagination: {
				totalItems: 11,
				itemsPerPage: 5,
				currentPage: 2,
				totalPages: 3,
			},
		});
	});

	it('retains unread count and null mutation envelopes, passing only the actor ID', async () => {
		const { controller, service, request, response } = setup();
		await controller.getMyUnreadCount(request, response as unknown as Response);
		expect(response.json).toHaveBeenLastCalledWith({
			success: true,
			data: { count: 3 },
		});
		await controller.markAsRead(request, response as unknown as Response);
		expect(service.markAsRead).toHaveBeenCalledWith(
			notification.id,
			notification.userId,
		);
		expect(response.json).toHaveBeenLastCalledWith({ success: true, data: null });
		await controller.markAllAsRead(request, response as unknown as Response);
		expect(service.markAllAsRead).toHaveBeenCalledWith(notification.userId);
		expect(response.json).toHaveBeenLastCalledWith({ success: true, data: null });
	});
});
