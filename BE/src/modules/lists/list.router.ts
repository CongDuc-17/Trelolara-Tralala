import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express from 'express';
import { StatusCodes } from 'http-status-codes';

import { ListsController } from './list.controller';
import { CardsController } from '../cards/card.controller';

import { autoBindUtil, validateRequestMiddleware } from '@/common';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';

import {
	listResponseDtoSchema,
	updateListRequestParams,
	updateListRequestSchema,
	moveListRequestSchema,
	moveListRequestValidationSchema,
	updateListRequestValidationSchema,
} from './dtos';

import {
	cardRequestQuery,
	cardResponseDtoSchema,
	cardListSummaryResponseDtoSchema,
	createCardRequestSchema,
	createCardRequestValidationSchema,
} from '../cards/dtos';
import { CardPermissionEnum, ListPermissionEnum } from '@/common/enums/permissions';

const listsController = new ListsController();
const cardsController = new CardsController();
export const listsRegistry = new OpenAPIRegistry();

const router = express.Router({ mergeParams: true });
autoBindUtil(listsController);
autoBindUtil(cardsController);

listsRegistry.registerPath({
	method: 'patch',
	path: '/lists/{listId}/move',
	tags: ['Lists'],
	request: moveListRequestSchema,
	responses: createApiResponse(listResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.patch(
	'/:listId/move',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(moveListRequestValidationSchema),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.MOVE_LIST),
	authMiddleware.verifyBoardLifecycle(),
	listsController.moveList,
);

listsRegistry.registerPath({
	method: 'patch',
	path: '/lists/{listId}/update',
	tags: ['Lists'],
	request: updateListRequestSchema,
	responses: createApiResponse(listResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.patch(
	'/:listId/update',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(updateListRequestValidationSchema),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.UPDATE_LIST),
	authMiddleware.verifyBoardLifecycle(),
	listsController.updateList,
);

listsRegistry.registerPath({
	method: 'patch',
	path: '/lists/{listId}/archive',
	tags: ['Lists'],
	request: {
		params: updateListRequestParams,
	},
	responses: createApiResponse(listResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:listId/archive',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: updateListRequestParams }),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.UPDATE_LIST),
	authMiddleware.verifyBoardLifecycle(),
	listsController.archiveList,
);

listsRegistry.registerPath({
	method: 'patch',
	path: '/lists/{listId}/restore',
	tags: ['Lists'],
	request: {
		params: updateListRequestParams,
	},
	responses: createApiResponse(listResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:listId/restore',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: updateListRequestParams }),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.UPDATE_LIST),
	authMiddleware.verifyBoardLifecycle('restore'),
	listsController.restoreList,
);

listsRegistry.registerPath({
	method: 'delete',
	path: '/lists/{listId}',
	tags: ['Lists'],
	request: { params: updateListRequestParams },
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});

router.delete(
	'/:listId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: updateListRequestParams }),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.DELETE_LIST),
	authMiddleware.verifyBoardLifecycle('delete'),
	listsController.deleteList,
);

listsRegistry.registerPath({
	method: 'get',
	path: '/lists/{listId}/cards',
	tags: ['Lists'],
	request: {
		params: createCardRequestSchema.params,
		query: cardRequestQuery,
	},
	responses: createApiResponse(
		cardListSummaryResponseDtoSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});
router.get(
	'/:listId/cards',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({
		params: createCardRequestSchema.params,
		query: cardRequestQuery,
	}),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	cardsController.getAllCardsByListId,
);

listsRegistry.registerPath({
	method: 'post',
	path: '/lists/{listId}/cards',
	tags: ['Lists'],
	request: createCardRequestSchema,
	responses: createApiResponse(cardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.post(
	'/:listId/cards',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(createCardRequestValidationSchema),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.CREATE_CARD),
	authMiddleware.verifyListLifecycle(),
	cardsController.createCard,
);

export const listsRouter = router;
