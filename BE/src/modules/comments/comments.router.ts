import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import express from 'express';
import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';

import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';

import { createApiResponse } from '@/swagger/openAPIResponseBuilders';

import { CardPermissionEnum } from '@/common/enums/permissions';

import { CommentsController } from './comments.controller';
import { CommentResponseDTOSchema } from './dtos/responses';
import {
	UpdateCommentRequestSchema,
	UpdateCommentRequestValidationSchema,
} from './dtos/requests';

const commentsController = new CommentsController();
export const commentsRegistry = new OpenAPIRegistry();
const router = express.Router();

autoBindUtil(commentsController);

commentsRegistry.registerPath({
	method: 'patch',
	path: '/comments/{commentId}',
	tags: ['Comments'],
	request: UpdateCommentRequestSchema,
	responses: createApiResponse(CommentResponseDTOSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:commentId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(UpdateCommentRequestValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	authMiddleware.verifyCardLifecycle(),
	commentsController.updateComment,
);

export const commentsRouter = router;
