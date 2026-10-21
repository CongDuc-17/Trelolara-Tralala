import 'reflect-metadata';
import type { Request, RequestHandler, Response, Router } from 'express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { cardsRegistry, cardsRouter } from '@/modules/cards/card.router';
import { labelsRouter } from '@/modules/labels/labels.router';
import { boardsRouter } from '@/modules/boards/boards.router';
import { CardsController } from '@/modules/cards/card.controller';
import { CardsService } from '@/modules/cards/card.service';
import { LabelsController } from '@/modules/labels/labels.controller';
import { LabelsService } from '@/modules/labels/labels.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import { BoardPermissionEnum, CardPermissionEnum } from '@/common/enums/permissions';
import { makeCard } from './cards.fixture';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (_req, _res, next) => next();
	return actual;
});
const id = '0a5fb79a-8eb3-4f1b-8615-85fdb47b3878';

function runBeforeController(
	router: Router,
	method: string,
	path: string,
	params: object,
	body: object = {},
	query: object = {},
) {
	const layers = (
		router as unknown as {
			stack: {
				route: {
					path: string;
					methods: Record<string, boolean>;
					stack: { handle: RequestHandler }[];
				};
			}[];
		}
	).stack;
	const route = layers.find(
		(layer) => layer.route.path === path && layer.route.methods[method],
	)!.route;
	const request = { params, body, query, user: { id } } as Request;
	const response = { locals: {} } as Response;
	let index = 0;
	return new Promise<unknown>((resolve, reject) => {
		const next = (error?: unknown) => {
			if (error || index === route.stack.length - 1) return resolve(error);
			try {
				Promise.resolve(
					route.stack[index++].handle(request, response, next),
				).catch(reject);
			} catch (failure) {
				reject(failure);
			}
		};
		next();
	});
}

describe('Card and label route security', () => {
	beforeEach(() => {
		jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
		jest.spyOn(
			PermissionsRepository.prototype,
			'findBoardProjectId',
		).mockResolvedValue(id);
		jest.spyOn(PermissionsRepository.prototype, 'listSystemRoles').mockResolvedValue([
			{ name: 'USER', permissions: [] },
		]);
		jest.spyOn(PermissionsRepository.prototype, 'listProjectRoles').mockResolvedValue(
			[],
		);
		jest.spyOn(PermissionsRepository.prototype, 'listBoardRoles').mockResolvedValue(
			[],
		);
	});
	it.each([
		[cardsRouter, 'patch', '/:cardId/archive', { cardId: 'bad' }, {}, {}],
		[cardsRouter, 'patch', '/:cardId/restore', { cardId: 'bad' }, {}, {}],
		[cardsRouter, 'delete', '/:cardId', { cardId: 'bad' }, {}, {}],
		[cardsRouter, 'post', '/:cardId/members', { cardId: id }, { userId: 'bad' }, {}],
		[cardsRouter, 'post', '/:cardId/labels', { cardId: id }, { labelId: 'bad' }, {}],
		[cardsRouter, 'post', '/:cardId/comments', { cardId: id }, { content: '' }, {}],
		[cardsRouter, 'get', '/:cardId', { cardId: id }, {}, { include: 'not-members' }],
		[labelsRouter, 'patch', '/:labelId', { labelId: id }, {}, {}],
		[labelsRouter, 'patch', '/:labelId', { labelId: id }, { boardId: id }, {}],
		[boardsRouter, 'get', '/:boardId/labels', { boardId: 'bad' }, {}, {}],
	] as const)(
		'validates %s %s %s before resource queries',
		async (router, method, path, params, body, query) => {
			await expect(
				runBeforeController(router, method, path, params, body, query),
			).resolves.toMatchObject({ status: 422 });
			expect(PermissionsRepository.prototype.findBoardId).not.toHaveBeenCalled();
		},
	);
	it.each([
		[cardsRouter, 'get', '/:cardId', { cardId: id }, {}],
		[cardsRouter, 'post', '/:cardId/labels', { cardId: id }, { labelId: id }],
		[
			cardsRouter,
			'delete',
			'/:cardId/labels/:labelId',
			{ cardId: id, labelId: id },
			{},
		],
		[cardsRouter, 'post', '/:cardId/members', { cardId: id }, { userId: id }],
		[
			cardsRouter,
			'delete',
			'/:cardId/members/:memberId',
			{ cardId: id, memberId: id },
			{},
		],
		[labelsRouter, 'patch', '/:labelId', { labelId: id }, { color: 'blue' }],
		[labelsRouter, 'delete', '/:labelId', { labelId: id }, {}],
		[
			boardsRouter,
			'post',
			'/:boardId/labels',
			{ boardId: id },
			{ name: 'Ready', color: '#ff0000' },
		],
		[boardsRouter, 'get', '/:boardId/labels', { boardId: id }, {}],
	] as const)(
		'denies an outsider on %s %s %s',
		async (router, method, path, params, body) => {
			await expect(
				runBeforeController(router, method, path, params, body),
			).resolves.toMatchObject({ status: 403 });
		},
	);
	it('denies a viewer mutation even if legacy grants contain writes', async () => {
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([
			{
				name: 'BOARD_VIEWER',
				permissions: [
					CardPermissionEnum.ASSIGN_MEMBER,
					BoardPermissionEnum.UPDATE_BOARD,
				],
			},
		]);
		await expect(
			runBeforeController(
				cardsRouter,
				'post',
				'/:cardId/members',
				{ cardId: id },
				{ userId: id },
			),
		).resolves.toMatchObject({ status: 403 });
		await expect(
			runBeforeController(
				labelsRouter,
				'patch',
				'/:labelId',
				{ labelId: id },
				{ color: 'red' },
			),
		).resolves.toMatchObject({ status: 403 });
	});
	it('allows member reads and partial label updates with the existing permission', async () => {
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([
			{
				name: 'BOARD_MEMBER',
				permissions: [
					CardPermissionEnum.GET_CARD,
					BoardPermissionEnum.UPDATE_BOARD,
				],
			},
		]);
		jest.spyOn(PermissionsRepository.prototype, 'findBoardState').mockResolvedValue({
			status: 'ACTIVE',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		});
		await expect(
			runBeforeController(
				cardsRouter,
				'get',
				'/:cardId',
				{ cardId: id },
				{},
				{ include: 'members, comments' },
			),
		).resolves.toBeUndefined();
		await expect(
			runBeforeController(
				labelsRouter,
				'patch',
				'/:labelId',
				{ labelId: id },
				{ color: 'blue' },
			),
		).resolves.toBeUndefined();
	});
});

describe('Card and label HTTP envelopes', () => {
	it('generates card documentation with include fields and relation mutation schemas', () => {
		const document = new OpenApiGeneratorV3(
			cardsRegistry.definitions,
		).generateDocument({ openapi: '3.0.0', info: { title: 'Cards', version: '1' } });
		expect(document.paths['/cards/{cardId}']?.get?.responses['200']).toMatchObject({
			content: {
				'application/json': {
					schema: {
						properties: {
							data: {
								properties: {
									memberCount: { type: 'number' },
									checklists: { type: 'array' },
									comments: { type: 'array' },
								},
							},
						},
					},
				},
			},
		});
		for (const [path, field] of [
			['labels', 'labelId'],
			['members', 'userId'],
		]) {
			expect(
				document.paths[`/cards/{cardId}/${path}`]?.post?.responses['200'],
			).toMatchObject({
				content: {
					'application/json': {
						schema: {
							properties: { data: { required: ['id', 'cardId', field] } },
						},
					},
				},
			});
		}
	});
	it('preserves mutation rows and null removals with no service HTTP envelope', async () => {
		const card = makeCard(id);
		const service = {
			createCard: jest.fn().mockResolvedValue(card),
			addMemberToCard: jest.fn().mockResolvedValue({ id, cardId: id, userId: id }),
			removeMemberFromCard: jest.fn().mockResolvedValue(undefined),
			deleteCard: jest.fn().mockResolvedValue(card),
			moveCard: jest.fn().mockResolvedValue(card),
		};
		const controller = new CardsController(service as unknown as CardsService);
		const json = jest.fn().mockReturnThis();
		const res = { json } as unknown as Response;
		const req = {
			params: { cardId: id, listId: id, memberId: id },
			user: { id },
			body: { title: 'Card', userId: id, targetListId: id },
			query: {},
		} as unknown as Request;
		await controller.createCard(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: card });
		await controller.addMemberToCard(req, res);
		expect(json).toHaveBeenLastCalledWith({
			success: true,
			data: { id, cardId: id, userId: id },
		});
		await controller.removeMemberFromCard(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: null });
		await controller.deleteCard(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: card });
		await controller.moveCard(req, res);
		expect(service.moveCard).toHaveBeenCalledWith(id, id, id, undefined, undefined);
	});
	it('parses exact include tokens and keeps the list envelope and status filter', async () => {
		const service = {
			getCardById: jest.fn().mockResolvedValue({ id }),
			getAllCardsByListId: jest.fn().mockResolvedValue([]),
		};
		const controller = new CardsController(service as unknown as CardsService);
		const json = jest.fn().mockReturnThis();
		const res = { json } as unknown as Response;
		const req = {
			params: { cardId: id, listId: id },
			user: { id },
			query: { include: 'members, comments', status: 'ARCHIVED' },
		} as unknown as Request;
		await controller.getCardById(req, res);
		expect(service.getCardById).toHaveBeenCalledWith(id, {
			members: true,
			comments: true,
			labels: false,
			checklists: false,
		});
		await controller.getAllCardsByListId(req, res);
		expect(service.getAllCardsByListId).toHaveBeenCalledWith(id, id, 'ARCHIVED');
		expect(json).toHaveBeenLastCalledWith({ success: true, data: [] });
	});
	it('retains the legacy label list envelope and the label field whitelist', async () => {
		const row = {
			id,
			name: 'Ready',
			color: 'red',
			boardId: id,
			createdAt: new Date(),
		};
		const service = {
			getLabelsByBoardId: jest.fn().mockResolvedValue([row]),
			updateLabel: jest.fn().mockResolvedValue(row),
			deleteLabel: jest.fn().mockResolvedValue(undefined),
		};
		const controller = new LabelsController(service as unknown as LabelsService);
		const json = jest.fn().mockReturnThis();
		const res = { json } as unknown as Response;
		const req = {
			params: { boardId: id, labelId: id },
			body: { color: 'red' },
		} as unknown as Request;
		await controller.getLabelsByBoardId(req, res);
		const { createdAt: _createdAt, ...label } = row;
		expect(json).toHaveBeenLastCalledWith({ data: [label] });
		await controller.updateLabel(req, res);
		expect(service.updateLabel).toHaveBeenCalledWith(id, { color: 'red' });
		expect(json).toHaveBeenLastCalledWith({ success: true, data: label });
		await controller.deleteLabel(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: null });
	});
});
