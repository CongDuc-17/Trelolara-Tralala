import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import express from 'express';
import { autoBindUtil } from '@/common/utils/autoBind.utils';
import authMiddleware from '@/common/middlewares/auth.middleware';

import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';

import { createApiResponse } from '@/swagger/openAPIResponseBuilders';

import { CardPermissionEnum } from '@/common/enums/permissions';

import { CommentsController } from './comments.controller';
import { CommentResponseDTOSchema } from './dtos/responses';
import { UpdateCommentRequestSchema } from './dtos/requests';

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
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	commentsController.updateComment,
);

export const commentsRouter = router;
