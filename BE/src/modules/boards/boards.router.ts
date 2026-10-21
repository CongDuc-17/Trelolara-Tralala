import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { BoardsController } from './boards.controller';
import express from 'express';
import { autoBindUtil } from '@/common/utils/autoBind.utils';
import authMiddleware from '@/common/middlewares/auth.middleware';
import { BoardPermissionEnum } from '@/common/enums/permissions/boardPermission.enum';

import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';
import {
	GetBoardByIdRequestSchema,
	updateBoardResponseDtoSchema,
	UpdateInformationBoardRequestSchema,
	getBoardMembersResponseDtoSchema,
	UserBoardResponseDTOSchema,
	GetBoardByIdRequestValidationSchema,
	UpdateInformationBoardRequestValidationSchema,
	UpdateRoleMemberBoardRequestValidationSchema,
} from './dtos';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import {
	createListRequestSchema,
	createListRequestValidationSchema,
	listResponseDtoSchema,
	getListsRequestSchema,
	getListsRequestValidationSchema,
} from '../lists/dtos';
import { ListsController } from '../lists/list.controller';
import { validateRequestMiddleware } from '@/common/middlewares/validationRequest.middleware';
import { ListPermissionEnum } from '@/common/enums/permissions';
import { UpdateRoleMemberBoardRequestSchema } from './dtos/requests/updateRoleMember.request';

import z from 'zod';
import {
	createLabelRequestSchema,
	createLabelRequestValidationSchema,
} from '../labels/dtos/requests';
import { LabelResponseDtoSchema } from '../labels/dtos/responses';
import { LabelsController } from '../labels/labels.controller';
import { UploadBackgroundRequestSchema } from './dtos/requests/uploadBackground.request';
import { uploadAvatarMiddleware } from '@/common/middlewares/upload.middleware';
import { getBoardResponseDtoSchema } from './dtos/responses/getBoard.response';
import { PaginationSchema } from '@/common/dtos/pagination.dto';
import { BoardStatusEnum } from '@prisma/client';
import { CardSearchController } from '../cards/card-search.controller';
import { cardSearchQuery } from '../cards/card-search.schema';
import { cardSearchPageSchema } from '../cards/card-search.response';
import { CardPermissionEnum } from '@/common/enums/permissions';

const boardsController = new BoardsController();
const listsController = new ListsController();
const labelsController = new LabelsController();
export const boardsRegistry = new OpenAPIRegistry();
const router = express.Router();
const cardSearch = new CardSearchController();
autoBindUtil(cardSearch);
boardsRegistry.registerPath({
	method: 'get',
	path: '/boards/{boardId}/cards',
	tags: ['Cards'],
	request: { params: z.strictObject({ boardId: z.uuid() }), query: cardSearchQuery },
	responses: createApiResponse(
		cardSearchPageSchema,
		'Filtered cards, newest first',
		200,
	),
});
router.get(
	'/:boardId/cards',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({
		params: z.strictObject({ boardId: z.uuid() }),
		query: cardSearchQuery,
	}),
	authMiddleware.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	cardSearch.board,
);

autoBindUtil(boardsController);
autoBindUtil(listsController);
autoBindUtil(labelsController);

boardsRegistry.registerPath({
	method: 'get',
	path: '/boards',
	tags: ['Boards'],
	responses: createApiResponse(
		UserBoardResponseDTOSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});
router.get(
	'/',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({
		query: z
			.object({ status: z.enum(BoardStatusEnum).optional(), ...PaginationSchema })
			.strict(),
	}),
	boardsController.getMyBoards,
);

boardsRegistry.registerPath({
	method: 'get',
	path: '/boards/{boardId}',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(getBoardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.get(
	'/:boardId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(GetBoardByIdRequestValidationSchema),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.GET_BOARD),
	boardsController.getBoardById,
);

boardsRegistry.registerPath({
	method: 'patch',
	path: '/boards/{boardId}',
	tags: ['Boards'],
	request: UpdateInformationBoardRequestSchema,
	responses: createApiResponse(updateBoardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.patch(
	'/:boardId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(UpdateInformationBoardRequestValidationSchema),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_BOARD),
	authMiddleware.verifyBoardLifecycle(),
	boardsController.updateBoardInformation,
);

boardsRegistry.registerPath({
	method: 'patch',
	path: '/boards/{boardId}/archive',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.patch(
	'/:boardId/archive',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.ARCHIVE_BOARD),
	authMiddleware.verifyBoardLifecycle(),
	boardsController.archiveBoard,
);

boardsRegistry.registerPath({
	method: 'patch',
	path: '/boards/{boardId}/restore',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.patch(
	'/:boardId/restore',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UNARCHIVE_BOARD),
	authMiddleware.verifyBoardLifecycle('restore'),
	boardsController.restoreBoard,
);

boardsRegistry.registerPath({
	method: 'delete',
	path: '/boards/{boardId}',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:boardId',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.DELETE_BOARD),
	authMiddleware.verifyBoardLifecycle('delete'),
	boardsController.deleteBoard,
);

boardsRegistry.registerPath({
	method: 'get',
	path: '/boards/{boardId}/members',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(
		getBoardMembersResponseDtoSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});
router.get(
	'/:boardId/members',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.GET_BOARD),
	boardsController.getBoardMembers,
);

boardsRegistry.registerPath({
	method: 'patch',
	path: '/boards/{boardId}/members',
	tags: ['Boards'],
	request: UpdateRoleMemberBoardRequestSchema,
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});

router.patch(
	'/:boardId/members',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(UpdateRoleMemberBoardRequestValidationSchema),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_MEMBER_ROLE),
	authMiddleware.verifyBoardLifecycle(),
	boardsController.changeRoleOfMemberBoard,
);

boardsRegistry.registerPath({
	method: 'delete',
	path: '/boards/{boardId}/members',
	tags: ['Boards'],
	request: {
		params: GetBoardByIdRequestSchema.params,
		body: {
			description: 'Remove a member from board',
			content: {
				'application/json': {
					schema: z.object({ userId: z.string() }),
				},
			},
		},
	},
	responses: createApiResponse(null, 'Success', StatusCodes.OK),
});
router.delete(
	'/:boardId/members',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({
		params: GetBoardByIdRequestSchema.params,
		body: z.object({ userId: z.string().uuid() }).strict(),
	}),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.REMOVE_MEMBER),
	authMiddleware.verifyBoardLifecycle(),
	boardsController.removeMember,
);

boardsRegistry.registerPath({
	method: 'get',
	path: '/boards/{boardId}/lists',
	tags: ['Boards'],
	request: getListsRequestSchema,
	responses: createApiResponse(
		listResponseDtoSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});

router.get(
	'/:boardId/lists',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(getListsRequestValidationSchema),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.GET_LIST),
	listsController.getAllListsByBoardId,
);

boardsRegistry.registerPath({
	method: 'post',
	path: '/boards/{boardId}/lists',
	tags: ['Boards'],
	request: createListRequestSchema,
	responses: createApiResponse(listResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.post(
	'/:boardId/lists',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(createListRequestValidationSchema),
	authMiddleware.verifyBoardPermission(ListPermissionEnum.CREATE_LIST),
	authMiddleware.verifyBoardLifecycle(),
	listsController.createList,
);

boardsRegistry.registerPath({
	method: 'get',
	path: '/boards/{boardId}/labels',
	tags: ['Boards'],
	request: GetBoardByIdRequestSchema,
	responses: createApiResponse(
		LabelResponseDtoSchema.array(),
		'Success',
		StatusCodes.OK,
	),
});
router.get(
	'/:boardId/labels',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.GET_BOARD),
	labelsController.getLabelsByBoardId,
);

boardsRegistry.registerPath({
	method: 'post',
	path: '/boards/{boardId}/labels',
	tags: ['Boards'],
	request: createLabelRequestSchema,
	responses: createApiResponse(LabelResponseDtoSchema, 'Success', StatusCodes.OK),
});

router.post(
	'/:boardId/labels',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware(createLabelRequestValidationSchema),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_BOARD),
	authMiddleware.verifyBoardLifecycle(),
	labelsController.createLabel,
);

boardsRegistry.registerPath({
	method: 'post',
	path: '/boards/{boardId}/background',
	tags: ['Boards'],
	request: UploadBackgroundRequestSchema,
	responses: createApiResponse(updateBoardResponseDtoSchema, 'Success', StatusCodes.OK),
});
router.post(
	'/:boardId/background',
	authMiddleware.verifyAccessToken,
	validateRequestMiddleware({ params: GetBoardByIdRequestSchema.params }),
	authMiddleware.verifyBoardPermission(BoardPermissionEnum.UPDATE_BOARD),
	authMiddleware.verifyBoardLifecycle(),
	uploadAvatarMiddleware.single('background'),
	boardsController.uploadBackground,
);

export const boardsRouter = router;
