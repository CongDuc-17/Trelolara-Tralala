import { Router } from 'express';
import { z } from 'zod';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import auth from '@/common/middlewares/auth.middleware';
import { validateRequestMiddleware } from '@/common/middlewares/validationRequest.middleware';
import { CardPermissionEnum } from '@/common/enums/permissions';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import { autoBindUtil } from '@/common';
import { CardActivitiesController } from './cardActivities.controller';

export const cardActivitiesRegistry = new OpenAPIRegistry();
export const cardActivitiesRouter = Router({ mergeParams: true });
export const cardActivitiesQuery = z.strictObject({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
const params = z.strictObject({ cardId: z.uuid() });
const controller = new CardActivitiesController();
autoBindUtil(controller);
cardActivitiesRegistry.registerPath({
	method: 'get',
	path: '/cards/{cardId}/activities',
	tags: ['Card activities'],
	request: { params, query: cardActivitiesQuery },
	responses: createApiResponse(
		z.object({
			items: z.array(
				z.object({
					id: z.uuid(),
					cardId: z.uuid(),
					userId: z.uuid(),
					action: z.string(),
					details: z.string().nullable(),
					metadata: z.record(z.string(), z.unknown()).nullable(),
					createdAt: z.date(),
					actor: z.object({
						id: z.uuid(),
						name: z.string(),
						avatar: z.string().nullable(),
					}),
				}),
			),
			nextCursor: z.uuid().nullable(),
		}),
		'Newest first; pass nextCursor to read older activities',
		200,
	),
});
cardActivitiesRouter.get(
	'/',
	auth.verifyAccessToken,
	validateRequestMiddleware({ params, query: cardActivitiesQuery }),
	auth.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	controller.list,
);
