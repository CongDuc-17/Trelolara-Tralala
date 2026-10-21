import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

import { ChecklistItemsController } from './checklistItems.controller';
import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import { checklistItemResponseDtoSchema } from './dtos/responses/checklistItem.response';
import {
	checklistItemByIdRequestSchema,
	checklistItemByIdValidationSchema,
	updateChecklistItemRequestSchema,
	updateChecklistItemValidationSchema,
} from './dtos/requests';
import { CardPermissionEnum } from '@/common/enums/permissions/cardPermission.enum';

const checklistItemsController = new ChecklistItemsController();
export const checklistItemsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(checklistItemsController);

checklistItemsRegistry.registerPath({
	method: 'patch',
	path: '/checklist-items/{checklistItemId}',
	tags: ['Checklist Items'],
	request: updateChecklistItemRequestSchema,
	responses: createApiResponse(
		checklistItemResponseDtoSchema,
		'Success',
		StatusCodes.OK,
	),
});
router.patch(
	'/:checklistItemId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(updateChecklistItemValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	authMiddleware.verifyCardLifecycle(),
	checklistItemsController.updateChecklistItem,
);

checklistItemsRegistry.registerPath({
	method: 'delete',
	path: '/checklist-items/{checklistItemId}',
	tags: ['Checklist Items'],
	request: checklistItemByIdRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:checklistItemId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(checklistItemByIdValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	authMiddleware.verifyBoardLifecycle('delete'),
	checklistItemsController.deleteChecklistItem,
);

export const checklistItemsRouter = router;
