import 'reflect-metadata';
import type { Request, RequestHandler, Response } from 'express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import {
	cardActivitiesRouter,
	cardActivitiesRegistry,
} from '@/modules/cardActivities/cardActivities.router';
import { CardActivitiesController } from '@/modules/cardActivities/cardActivities.controller';
import type { CardActivitiesService } from '@/modules/cardActivities/cardActivities.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (_req, _res, next) => next();
	return actual;
});
const id = '00000000-0000-4000-8000-000000000001';
async function beforeController(params: object, query: object = {}) {
	const layers = (
		cardActivitiesRouter as unknown as {
			stack: { route: { stack: { handle: RequestHandler }[] } }[];
		}
	).stack;
	const handlers = layers[0].route.stack.slice(0, -1);
	const req = { params, query, user: { id } } as unknown as Request;
	const res = { locals: {} } as Response;
	let failure: unknown;
	for (const { handle } of handlers) {
		await new Promise<void>((resolve, reject) => {
			try {
				Promise.resolve(
					handle(req, res, (error?: unknown) => {
						failure = error;
						resolve();
					}),
				).catch(reject);
			} catch (error) {
				reject(error);
			}
		});
		if (failure) break;
	}
	return { failure, req };
}
beforeEach(() => {
	jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
	jest.spyOn(PermissionsRepository.prototype, 'findBoardProjectId').mockResolvedValue(
		id,
	);
	jest.spyOn(PermissionsRepository.prototype, 'listSystemRoles').mockResolvedValue([]);
	jest.spyOn(PermissionsRepository.prototype, 'listProjectRoles').mockResolvedValue([]);
	jest.spyOn(PermissionsRepository.prototype, 'listBoardRoles').mockResolvedValue([
		{ name: 'BOARD_VIEWER', permissions: ['GET_CARD'] },
	]);
});
describe('Card activity HTTP contract', () => {
	it.each([
		[{ cardId: 'bad' }, {}],
		[{ cardId: id }, { cursor: 'bad' }],
		[{ cardId: id }, { limit: '0' }],
		[{ cardId: id }, { limit: '101' }],
		[{ cardId: id }, { limit: '1.5' }],
		[{ cardId: id }, { limit: 'many' }],
		[{ cardId: id }, { userId: id }],
	])(
		'validates IDs, cursor and bounded pagination before any resource lookup',
		async (params, query) => {
			expect((await beforeController(params, query)).failure).toMatchObject({
				status: 422,
			});
			expect(PermissionsRepository.prototype.findBoardId).not.toHaveBeenCalled();
		},
	);
	it('passes parsed defaults/cursor/limit to the service with the actor and preserves the envelope', async () => {
		const first = await beforeController({ cardId: id });
		expect(first.failure).toBeUndefined();
		expect(first.req.query).toEqual({ limit: 20 });
		const second = await beforeController({ cardId: id }, { cursor: id, limit: '5' });
		expect(second.req.query).toEqual({ cursor: id, limit: 5 });
		const page = { items: [], nextCursor: null };
		const service = { list: jest.fn().mockResolvedValue(page) };
		const json = jest.fn();
		await new CardActivitiesController(
			service as unknown as CardActivitiesService,
		).list(second.req, { json } as unknown as Response);
		expect(service.list).toHaveBeenCalledWith(id, id, { cursor: id, limit: 5 });
		expect(json).toHaveBeenCalledWith({ success: true, data: page });
	});
	it('denies outsiders while preserving inherited project read permission', async () => {
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([]);
		expect((await beforeController({ cardId: id })).failure).toMatchObject({
			status: 403,
		});
		jest.mocked(PermissionsRepository.prototype.listProjectRoles).mockResolvedValue([
			{ name: 'PROJECT_VIEWER', permissions: ['GET_CARD'] },
		]);
		expect((await beforeController({ cardId: id })).failure).toBeUndefined();
	});
	it('generates documentation for cursor pagination, actor and legacy fields', () => {
		const doc = new OpenApiGeneratorV3(
			cardActivitiesRegistry.definitions,
		).generateDocument({
			openapi: '3.0.0',
			info: { title: 'Card activities', version: '1' },
		});
		expect(
			doc.paths['/cards/{cardId}/activities']?.get?.responses['200'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: {
						properties: {
							data: {
								properties: {
									items: { type: 'array' },
									nextCursor: { type: 'string', nullable: true },
								},
							},
						},
					},
				},
			},
		});
	});
});
