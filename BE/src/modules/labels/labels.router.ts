import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import { BoardPermissionEnum } from '@/common/enums/permissions';

import { LabelsController } from './labels.controller';

import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';

import { LabelResponseDtoSchema } from './dtos/responses';
import {
	updateLabelRequestParams,
	updateLabelRequestSchema,
	updateLabelRequestValidationSchema,
} from './dtos/requests';

const labelsController = new LabelsController();
export const labelsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(labelsController);

labelsRegistry.registerPath({
	method: 'patch',
	path: '/labels/{labelId}',
	tags: ['Labels'],
	request: updateLabelRequestSchema,
	responses: createApiResponse(LabelResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:labelId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(updateLabelRequestValidationSchema),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_BOARD),
	authMiddleware.verifyBoardLifecycle(),
	labelsController.updateLabel,
);

labelsRegistry.registerPath({
	method: 'delete',
	path: '/labels/{labelId}',
	tags: ['Labels'],
	request: {
		params: updateLabelRequestParams,
	},
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:labelId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: updateLabelRequestParams }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_BOARD),
	authMiddleware.verifyBoardLifecycle('delete'),
	labelsController.deleteLabel,
);

export const labelsRouter = router;
