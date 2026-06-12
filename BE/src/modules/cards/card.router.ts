import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

import { CardsController } from './card.controller';
import { ChecklistsController } from '../checklists/checklists.controller';
import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import {
	addMemberRequestSchema,
	addMemberRequestValidationSchema,
	cardResponseDtoSchema,
	getCardRequestSchema,
	getCardRequestValidationSchema,
	moveCardRequestParams,
	moveCardRequestSchema,
	moveCardRequestValidationSchema,
	updateInformationCardRequestSchema,
	updateInformationCardRequestValidationSchema,
	removeMemberRequestValidationSchema,
	removeMemberRequestSchema,
	addLabelRequestSchema,
	addLabelRequestValidationSchema,
	removeLabelRequestSchema,
	removeLabelRequestValidationSchema,
	getCardRequestParams,
	getCardRequestParamsSchema,
} from './dtos';

import { CardPermissionEnum } from '@/common/enums/permissions';
import {
	checklistByIdRequestSchema,
	createChecklistRequestSchema,
	createChecklistValidationSchema,
} from '../checklists/dtos/requests';
import { checklistResponseDtoSchema } from '../checklists/dtos/responses';
import { CommentsController } from '../comments/comments.controller';
import { CommentResponseDTOSchema } from '../comments/dtos/responses';
import { CreateCommentRequestSchema } from '../comments/dtos/requests';

const cardsController = new CardsController();
const checklistsController = new ChecklistsController();
const commentsController = new CommentsController();
export const cardsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(cardsController);
autoBindUtil(checklistsController);
autoBindUtil(commentsController);

cardsRegistry.registerPath({
	method: 'get',
	path: '/cards/{cardId}',
	tags: ['Cards'],
	request: getCardRequestSchema,
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.get(
	'/:cardId',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	validateRequestMiddleware(getCardRequestValidationSchema),
	cardsController.getCardById,
);

cardsRegistry.registerPath({
	method: 'patch',
	path: '/cards/{cardId}/move',
	tags: ['Cards'],
	request: moveCardRequestSchema,
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.patch(
	'/:cardId/move',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.MOVE_CARD),
	validateRequestMiddleware(moveCardRequestValidationSchema),
	cardsController.moveCard,
);

cardsRegistry.registerPath({
	method: 'patch',
	path: '/cards/{cardId}/archive',
	tags: ['Cards'],
	request: {
		params: moveCardRequestParams,
	},
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:cardId/archive',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	cardsController.archiveCard,
);

cardsRegistry.registerPath({
	method: 'patch',
	path: '/cards/{cardId}/restore',
	tags: ['Cards'],
	request: {
		params: moveCardRequestParams,
	},
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:cardId/restore',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	cardsController.restoreCard,
);

cardsRegistry.registerPath({
	method: 'delete',
	path: '/cards/{cardId}',
	tags: ['Cards'],
	request: {
		params: moveCardRequestParams,
	},
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.delete(
	'/:cardId',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.DELETE_CARD),
	cardsController.deleteCard,
);

cardsRegistry.registerPath({
	method: 'post',
	path: '/cards/{cardId}/labels',
	tags: ['Cards'],
	request: addLabelRequestSchema,
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.post(
	'/:cardId/labels',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	validateRequestMiddleware(addLabelRequestValidationSchema),
	cardsController.addLabelToCard,
);

cardsRegistry.registerPath({
	method: 'delete',
	path: '/cards/{cardId}/labels/{labelId}',
	tags: ['Cards'],
	request: removeLabelRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:cardId/labels/:labelId',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	validateRequestMiddleware(removeLabelRequestValidationSchema),
	cardsController.removeLabelFromCard,
);

cardsRegistry.registerPath({
	method: 'post',
	path: '/cards/{cardId}/members',
	tags: ['Cards'],
	request: addMemberRequestSchema,
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.post(
	'/:cardId/members',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.ASSIGN_MEMBER),
	validateRequestMiddleware(addMemberRequestValidationSchema),
	cardsController.addMemberToCard,
);

cardsRegistry.registerPath({
	method: 'delete',
	path: '/cards/{cardId}/members/{memberId}',
	tags: ['Cards'],
	request: removeMemberRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:cardId/members/:memberId',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UNASSIGN_MEMBER),
	validateRequestMiddleware(removeMemberRequestValidationSchema),
	cardsController.removeMemberFromCard,
);

cardsRegistry.registerPath({
	method: 'post',
	path: '/cards/{cardId}/checklists',
	tags: ['Cards'],
	request: createChecklistRequestSchema,
	responses: createApiResponse(checklistResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.post(
	'/:cardId/checklists',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	validateRequestMiddleware(createChecklistValidationSchema),
	checklistsController.createChecklist,
);

cardsRegistry.registerPath({
	method: 'get',
	path: '/cards/{cardId}/comments',
	tags: ['Cards'],
	request: getCardRequestParamsSchema,
	responses: createApiResponse(
		CommentResponseDTOSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});

router.get(
	'/:cardId/comments',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	commentsController.getCommentsByCardId,
);

cardsRegistry.registerPath({
	method: 'post',
	path: '/cards/{cardId}/comments',
	tags: ['Cards'],
	request: CreateCommentRequestSchema,
	responses: createApiResponse(CommentResponseDTOSchema, 'Success', StatusCodes.OK),
});

router.post(
	'/:cardId/comments',
	authMiddleware.verifyAccessToken,
	authMiddleware.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	commentsController.createComment,
);

export const cardsRouter = router;
