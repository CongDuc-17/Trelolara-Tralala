import {
	NotificationResponseDtoSchema,
	unreadCountResponseSchema,
} from './dtos/responses/notification.response';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

import { NotificationsController } from './notifications.controller';

import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import { getNotificationsRequestSchema, markNotificationRequestSchema } from './dtos';

const notificationsController = new NotificationsController();

export const notificationsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(notificationsController);

notificationsRegistry.registerPath({
	method: 'get',
	path: '/notifications',
	tags: ['Notifications'],
	request: getNotificationsRequestSchema,
	responses: createApiResponse(
		NotificationResponseDtoSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});
router.get(
	'/',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(getNotificationsRequestSchema),
	notificationsController.getMyNotifications,
);

notificationsRegistry.registerPath({
	method: 'get',
	path: '/notifications/unread-count',
	tags: ['Notifications'],
	responses: createApiResponse(unreadCountResponseSchema, 'Success', StatusCodes.OK),
});
router.get(
	'/unread-count',
	authMiddleware.verifyAccessToken,
	notificationsController.getMyUnreadCount,
);

notificationsRegistry.registerPath({
	method: 'patch',
	path: '/notifications/{notificationId}/read',
	tags: ['Notifications'],
	request: markNotificationRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.patch(
	'/:notificationId/read',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(markNotificationRequestSchema),
	notificationsController.markAsRead,
);

notificationsRegistry.registerPath({
	method: 'patch',
	path: '/notifications/read-all',
	tags: ['Notifications'],
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.patch(
	'/read-all',
	authMiddleware.verifyAccessToken,
	notificationsController.markAllAsRead,
);

export const notificationsRouter = router;
