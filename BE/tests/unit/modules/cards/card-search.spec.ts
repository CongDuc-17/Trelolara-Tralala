import 'reflect-metadata';
import type { Request, Response, RequestHandler, Router } from 'express';
import { generateOpenAPIDocument } from '@/swagger/openAPIDocumentGenerator';
import { cardSearchQuery, myWorkQuery } from '@/modules/cards/card-search.schema';
import {
	cardFilterWhere,
	CardSearchRepository,
} from '@/modules/cards/card-search.repository';
import { CardSearchService } from '@/modules/cards/card-search.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import type { DatabaseClient } from '@/modules/database';
import { boardsRouter } from '@/modules/boards/boards.router';
import { usersRouter } from '@/modules/users/users.router';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (_req, _res, next) => next();
	return actual;
});
const id = '0a5fb79a-8eb3-4f1b-8615-85fdb47b3878';
const other = '12345678-1234-4234-8234-123456789abc';
const now = new Date('2026-10-21T00:00:00Z');
const query = cardSearchQuery.parse({});
function fixture() {
	const cards = { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() };
	const roles = { findMany: jest.fn().mockResolvedValue([]) };
	const client = { cards, roles } as unknown as DatabaseClient;
	return { cards, roles, repository: new CardSearchRepository(client) };
}

describe('card discovery filters and scoped persistence', () => {
	it('parses false, trims keyword, deduplicates OR groups and bounds pagination', () => {
		expect(
			cardSearchQuery.parse({
				keyword: '  task ',
				isComplete: 'false',
				memberIds: `${id},${id}`,
				labelIds: `${id},${other}`,
				limit: '5',
			}),
		).toMatchObject({
			keyword: 'task',
			isComplete: false,
			memberIds: [id],
			labelIds: [id, other],
			limit: 5,
			status: 'ACTIVE',
		});
	});
	it.each([
		{ limit: '101' },
		{ limit: '0' },
		{ limit: '1.5' },
		{ keyword: '   ' },
		{ isComplete: '0' },
		{ memberIds: 'bad' },
		{ labelIds: `${id},` },
		{ cursor: 'bad' },
		{ due: 'all' },
		{ typo: 'yes' },
		{ keyword: ['a', 'b'] },
	])('rejects malformed query %p', (input) => {
		expect(cardSearchQuery.safeParse(input).success).toBe(false);
	});
	it('does not accept archived My work queries', () => {
		expect(myWorkQuery.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
	});
	it('ANDs filter groups, retains false and ORs IDs inside each group', () => {
		const where = cardFilterWhere(
			{
				...query,
				memberIds: [id, other],
				labelIds: [other],
				isComplete: false,
				keyword: 'Task',
			},
			now,
		);
		expect(where.AND).toEqual(
			expect.arrayContaining([
				{ cardMembers: { some: { userId: { in: [id, other] } } } },
				{ cardLabels: { some: { labelId: { in: [other] } } } },
				{ isComplete: false },
				{ title: { contains: 'Task', mode: 'insensitive' } },
				{
					status: 'ACTIVE',
					deletedAt: null,
					list: {
						status: 'ACTIVE',
						deletedAt: null,
						board: {
							status: 'ACTIVE',
							deletedAt: null,
							project: { status: 'ACTIVE', deletedAt: null },
						},
					},
				},
			]),
		);
	});
	it.each([
		['overdue', { isComplete: false, dueDate: { lt: now } }],
		[
			'soon',
			{
				isComplete: false,
				dueDate: { gte: now, lte: new Date(now.getTime() + 86400000) },
			},
		],
		['none', { dueDate: null }],
	] as const)('defines %s boundaries using the same request clock', (due, expected) => {
		expect(cardFilterWhere({ ...query, due }, now).AND).toContainEqual(expected);
	});
	it('allows archived ancestors for board archive discovery but excludes deleted projects/boards', () => {
		const where = cardFilterWhere({ ...query, status: 'ARCHIVED' }, now);
		expect(where.AND).toContainEqual({
			list: {
				board: {
					status: { not: 'DELETED' },
					project: { status: { not: 'DELETED' } },
				},
			},
		});
		expect(where.AND).toContainEqual({
			OR: expect.arrayContaining([
				{ list: { board: { project: { status: 'ARCHIVED' } } } },
			]),
		});
	});
	it('scopes My work in SQL to both assignment and current direct/inherited grants', async () => {
		const f = fixture();
		await f.repository.search(id, query, undefined, now);
		const args = f.cards.findMany.mock.calls[0][0];
		expect(args.where.AND[0].AND).toContainEqual({
			cardMembers: { some: { userId: id } },
		});
		const scope = args.where.AND[0].AND[1].list.board.AND[0];
		expect(scope.OR).toEqual([
			{
				boardMembers: {
					some: {
						userId: id,
						role: {
							status: 'ACTIVE',
							deletedAt: null,
							rolesPermissions: {
								some: {
									permission: { name: 'GET_CARD', deletedAt: null },
								},
							},
						},
					},
				},
			},
			{ project: { members: { some: { userId: id, role: expect.any(Object) } } } },
		]);
		expect(JSON.stringify(scope)).not.toContain('accepted');
	});
	it('system USER grants do not bypass resource scope; ADMIN still requires My work assignment', async () => {
		const f = fixture();
		f.roles.findMany.mockResolvedValue([
			{ name: 'USER', rolesPermissions: [{ permission: { name: 'GET_CARD' } }] },
		]);
		await f.repository.search(id, query, other, now);
		expect(
			f.cards.findMany.mock.calls[0][0].where.AND[0].AND[1].list.board.AND,
		).toEqual([expect.objectContaining({ OR: expect.any(Array) }), { id: other }]);
		f.roles.findMany.mockResolvedValue([{ name: 'ADMIN', rolesPermissions: [] }]);
		await f.repository.search(id, query, undefined, now);
		expect(f.cards.findMany.mock.calls[1][0].where.AND[0].AND).toContainEqual({
			cardMembers: { some: { userId: id } },
		});
	});
	it('returns a bounded stable page and validates the cursor in the same visibility scope', async () => {
		const f = fixture();
		f.cards.findFirst.mockResolvedValue({ id: other, createdAt: now });
		f.cards.findMany.mockResolvedValue([{ id }, { id: other }]);
		const result = await f.repository.search(
			id,
			{ ...query, cursor: other, limit: 1 },
			other,
			now,
		);
		expect(result).toEqual({ items: [{ id }], nextCursor: id });
		expect(f.cards.findFirst.mock.calls[0][0].where.AND[0]).toEqual(
			f.cards.findMany.mock.calls[0][0].where.AND[0],
		);
		expect(f.cards.findMany.mock.calls[0][0]).toMatchObject({
			take: 2,
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		});
		expect(f.cards.findMany.mock.calls[0][0].where.AND[1]).toEqual({
			OR: [{ createdAt: { lt: now } }, { createdAt: now, id: { lt: other } }],
		});
	});
	it('rejects a deleted, foreign or newly invisible cursor before reading the page', async () => {
		const f = fixture();
		f.cards.findFirst.mockResolvedValue(null);
		await expect(
			f.repository.search(id, { ...query, cursor: other }, id, now),
		).rejects.toMatchObject({ status: 422 });
		expect(f.cards.findMany).not.toHaveBeenCalled();
	});
	it('computes overdue with one clock and enforces active My work at the use case', async () => {
		const search = jest.fn().mockResolvedValue({
			items: [{ dueDate: new Date(now.getTime() - 1), isComplete: false }],
			nextCursor: null,
		});
		const service = new CardSearchService(
			{ search } as unknown as CardSearchRepository,
			() => now,
		);
		expect(await service.search(id, { ...query, status: 'ALL' })).toMatchObject({
			items: [{ isOverdue: true }],
		});
		expect(search).toHaveBeenCalledWith(id, query, undefined, now);
	});
});

describe('card search HTTP contracts', () => {
	async function beforeController(
		router: Router,
		path: string,
		params: object,
		input: object,
	) {
		const layers = router.stack as unknown as {
			route: { path: string; stack: { handle: RequestHandler }[] };
		}[];
		const route = layers.find((layer) => layer.route?.path === path)!.route;
		const req = { params, query: input, user: { id } } as unknown as Request;
		let position = 0;
		return new Promise<unknown>((resolve, reject) => {
			const next = (error?: unknown) => {
				if (error || position === route.stack.length - 1) return resolve(error);
				Promise.resolve(
					route.stack[position++].handle(req, { locals: {} } as Response, next),
				).catch(reject);
			};
			next();
		});
	}
	it('validates board params/query before resolving resource permission', async () => {
		const lookup = jest.spyOn(PermissionsRepository.prototype, 'findBoardId');
		expect(
			await beforeController(
				boardsRouter,
				'/:boardId/cards',
				{ boardId: 'bad' },
				{},
			),
		).toBeTruthy();
		expect(
			await beforeController(
				boardsRouter,
				'/:boardId/cards',
				{ boardId: id },
				{ limit: '1000' },
			),
		).toBeTruthy();
		expect(lookup).not.toHaveBeenCalled();
	});
	it('requires scoped GET_CARD and denies outsiders', async () => {
		jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
		jest.spyOn(PermissionsRepository.prototype, 'listSystemRoles').mockResolvedValue(
			[],
		);
		jest.spyOn(PermissionsRepository.prototype, 'listBoardRoles').mockResolvedValue(
			[],
		);
		jest.spyOn(
			PermissionsRepository.prototype,
			'findBoardProjectId',
		).mockResolvedValue(other);
		jest.spyOn(PermissionsRepository.prototype, 'listProjectRoles').mockResolvedValue(
			[],
		);
		expect(
			await beforeController(boardsRouter, '/:boardId/cards', { boardId: id }, {}),
		).toMatchObject({ status: 403 });
	});
	it('registers My work before user ID routes and generates both OpenAPI operations', async () => {
		expect(
			await beforeController(usersRouter, '/me/cards', {}, { isComplete: 'false' }),
		).toBeUndefined();
		const document = generateOpenAPIDocument();
		expect(document.paths['/users/me/cards']?.get).toBeDefined();
		expect(document.paths['/boards/{boardId}/cards']?.get).toBeDefined();
	});
});
