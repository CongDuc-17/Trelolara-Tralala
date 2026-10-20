import { checklistItems } from '@prisma/client';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

import { ChecklistsController } from './checklists.controller';

import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import {
	checklistByIdRequestSchema,
	checklistByIdValidationSchema,
	updateChecklistTitleRequestSchema,
	updateChecklistTitleValidationSchema,
} from './dtos/requests';
import { checklistResponseDtoSchema } from './dtos/responses';
import { CardPermissionEnum } from '@/common/enums/permissions';
import {
	createChecklistItemRequestSchema,
	createChecklistItemValidationSchema,
} from '../checklistItems/dtos/requests';
import { checklistItemResponseDtoSchema } from '../checklistItems/dtos/responses/checklistItem.response';
import { ChecklistItemsController } from '../checklistItems/checklistItems.controller';

const checklistsController = new ChecklistsController();
const checklistItemsController = new ChecklistItemsController();
export const checklistsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(checklistsController);
autoBindUtil(checklistItemsController);

checklistsRegistry.registerPath({
	method: 'patch',
	path: '/checklists/{checklistId}',
	tags: ['Checklists'],
	request: updateChecklistTitleRequestSchema,
	responses: createApiResponse(checklistResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:checklistId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(updateChecklistTitleValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	checklistsController.updateChecklistTitle,
);

checklistsRegistry.registerPath({
	method: 'delete',
	path: '/checklists/{checklistId}',
	tags: ['Checklists'],
	request: checklistByIdRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:checklistId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(checklistByIdValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.DELETE_CARD),
	checklistsController.deleteChecklist,
);

checklistsRegistry.registerPath({
	method: 'post',
	path: '/checklists/{checklistId}',
	tags: ['Checklists'],
	request: createChecklistItemRequestSchema,
	responses: createApiResponse(
		checklistItemResponseDtoSchema,
		'Success',
		StatusCodes.OK,
	),
});
router.post(
	'/:checklistId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(createChecklistItemValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	checklistItemsController.createChecklistItem,
);

export const checklistsRouter = router;
