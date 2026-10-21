import 'reflect-metadata';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import {
	notificationsRegistry,
	notificationsRouter,
} from '@/modules/notifications/notifications.router';
import { NotificationsService } from '@/modules/notifications/notifications.service';

jest.mock('@/socket/socket.server', () => ({ sendToUser: jest.fn() }));
jest.mock('@/common/middlewares/auth.middleware', () => ({
	__esModule: true,
	default: {
		verifyAccessToken: (_req: Request, _res: Response, next: NextFunction) => next(),
	},
}));

type RouteLayer = { route: { path: string; stack: { handle: RequestHandler }[] } };

describe('Notification router validation and documentation', () => {
	it.each([
		['/', { query: { isRead: 'invalid' }, params: {} }, 'getMyNotifications'],
		[
			'/:notificationId/read',
			{ query: {}, params: { notificationId: 'invalid' } },
			'markAsRead',
		],
	] as const)('validates %s before calling the service', (path, input, method) => {
		const layers = (notificationsRouter as unknown as { stack: RouteLayer[] }).stack;
		const layer = layers.find((item) => item.route.path === path)!;
		const serviceCall = jest.spyOn(NotificationsService.prototype, method);
		const request = { ...input, user: { id: 'recipient-1' } } as unknown as Request;
		const response = { locals: {} } as Response;
		let error: unknown;
		let index = 0;
		const next: NextFunction = (failure?: unknown) => {
			if (failure) {
				error = failure;
				return;
			}
			const handler = layer.route.stack[index++]?.handle;
			if (handler) handler(request, response, next);
		};
		next();
		expect(error).toMatchObject({ status: 422 });
		expect(serviceCall).not.toHaveBeenCalled();
	});

	it('generates the existing four OpenAPI paths and documents list filters and array response', () => {
		const document = new OpenApiGeneratorV3(
			notificationsRegistry.definitions,
		).generateDocument({
			openapi: '3.0.0',
			info: { title: 'Notifications test', version: '1' },
		});
		expect(Object.keys(document.paths)).toEqual([
			'/notifications',
			'/notifications/unread-count',
			'/notifications/{notificationId}/read',
			'/notifications/read-all',
		]);
		expect(document.paths['/notifications']?.get?.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'page', in: 'query' }),
				expect.objectContaining({ name: 'limit', in: 'query' }),
				expect.objectContaining({
					name: 'isRead',
					in: 'query',
					schema: { type: 'string', enum: ['true', 'false'] },
				}),
			]),
		);
		expect(document.paths['/notifications']?.get?.responses['200']).toMatchObject({
			content: {
				'application/json': {
					schema: { properties: { data: { type: 'array' } } },
				},
			},
		});
	});
});
