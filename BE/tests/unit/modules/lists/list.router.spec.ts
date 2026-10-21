import 'reflect-metadata';
import type { Request, RequestHandler, Response, Router } from 'express';
import { listsRouter } from '@/modules/lists/list.router';
import { boardsRouter } from '@/modules/boards/boards.router';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/modules/lists/list.service', () => ({ ListsService: jest.fn() }));
jest.mock('@/modules/cards/card.service', () => ({ CardsService: jest.fn() }));
jest.mock('@/modules/boards/boards.service', () => ({ BoardsService: jest.fn() }));
jest.mock('@/modules/labels/labels.service', () => ({ LabelsService: jest.fn() }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const permissionCheck = jest.fn();
	const lifecycleCheck = jest.fn();
	const listLifecycleCheck = jest.fn();
	return {
		__esModule: true,
		permissionCheck,
		lifecycleCheck,
		listLifecycleCheck,
		default: {
			verifyAccessToken: (_req: Request, _res: Response, next: () => void) =>
				next(),
			verifyBoardPermission:
				(...permissions: string[]) =>
				(_req: Request, _res: Response, next: () => void) => {
					permissionCheck(...permissions);
					next();
				},
			verifyBoardLifecycle:
				(action = 'write') =>
				(_req: Request, _res: Response, next: () => void) => {
					lifecycleCheck(action);
					next();
				},
			verifyListLifecycle:
				() => (_req: Request, _res: Response, next: () => void) => {
					listLifecycleCheck();
					next();
				},
		},
	};
});

const { permissionCheck, lifecycleCheck, listLifecycleCheck } = jest.requireMock(
	'@/common/middlewares/auth.middleware',
) as {
	permissionCheck: jest.Mock;
	lifecycleCheck: jest.Mock;
	listLifecycleCheck: jest.Mock;
};
const id = 'e81da272-2fbf-47fc-a1af-7cd510086071';

function beforeController(
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
	return new Promise<{ error?: unknown; request: Request }>((resolve, reject) => {
		const next = (error?: unknown) => {
			if (error || index === route.stack.length - 1) {
				resolve({ error, request });
				return;
			}
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

describe('Lists route validation and middleware contracts', () => {
	it.each([
		['patch', '/:listId/move', { listId: 'bad' }, {}],
		['patch', '/:listId/move', { listId: id }, { beforeListId: '' }],
		['patch', '/:listId/move', { listId: id }, { afterListId: 'bad' }],
		['patch', '/:listId/update', { listId: id }, {}],
		['patch', '/:listId/update', { listId: id }, { name: '' }],
		['patch', '/:listId/update', { listId: id }, { name: 'Ready', status: 'ACTIVE' }],
		['patch', '/:listId/archive', { listId: 'bad' }, {}],
		['patch', '/:listId/restore', { listId: 'bad' }, {}],
		['delete', '/:listId', { listId: 'bad' }, {}],
		['get', '/:listId/cards', { listId: 'bad' }, {}],
		['post', '/:listId/cards', { listId: id }, { title: '' }],
	])(
		'rejects malformed %s %s before permission queries',
		async (method, path, params, body) => {
			const result = await beforeController(
				listsRouter,
				method,
				path,
				params,
				body,
			);
			expect(result.error).toMatchObject({ status: 422 });
			expect(permissionCheck).not.toHaveBeenCalled();
			expect(lifecycleCheck).not.toHaveBeenCalled();
			expect(listLifecycleCheck).not.toHaveBeenCalled();
		},
	);

	it.each([
		['get', '/:boardId/lists', { boardId: 'bad' }, {}, {}],
		['get', '/:boardId/lists', { boardId: id }, {}, { status: 'DELETED' }],
		['post', '/:boardId/lists', { boardId: id }, { name: '' }, {}],
	])(
		'validates %s %s before board permission queries',
		async (method, path, params, body, query) => {
			const result = await beforeController(
				boardsRouter,
				method,
				path,
				params,
				body,
				query,
			);
			expect(result.error).toMatchObject({ status: 422 });
			expect(permissionCheck).not.toHaveBeenCalled();
		},
	);

	it('passes the archived-list status through parsed board query and permits reads', async () => {
		const result = await beforeController(
			boardsRouter,
			'get',
			'/:boardId/lists',
			{ boardId: id },
			{},
			{ status: 'ARCHIVED' },
		);
		expect(result.error).toBeUndefined();
		expect(result.request.query).toEqual({ status: 'ARCHIVED' });
		expect(permissionCheck).toHaveBeenCalledWith('GET_LIST');
		expect(lifecycleCheck).not.toHaveBeenCalled();
	});

	it.each([
		['patch', '/:listId/move', {}, 'MOVE_LIST', 'write'],
		['patch', '/:listId/update', { name: 'Done' }, 'UPDATE_LIST', 'write'],
		['patch', '/:listId/archive', {}, 'UPDATE_LIST', 'write'],
		['patch', '/:listId/restore', {}, 'UPDATE_LIST', 'restore'],
		['delete', '/:listId', {}, 'DELETE_LIST', 'delete'],
	])(
		'keeps permission and lifecycle guards for %s %s',
		async (method, path, body, permission, lifecycle) => {
			const result = await beforeController(
				listsRouter,
				method,
				path,
				{ listId: id },
				body,
			);
			expect(result.error).toBeUndefined();
			expect(permissionCheck).toHaveBeenCalledWith(permission);
			expect(lifecycleCheck).toHaveBeenCalledWith(lifecycle);
		},
	);

	it('checks the list lifecycle before creating child cards', async () => {
		const result = await beforeController(
			listsRouter,
			'post',
			'/:listId/cards',
			{ listId: id },
			{ title: 'New' },
		);
		expect(result.error).toBeUndefined();
		expect(permissionCheck).toHaveBeenCalledWith('CREATE_CARD');
		expect(listLifecycleCheck).toHaveBeenCalledTimes(1);
	});

	it('preserves board-scoped creation and its write guard', async () => {
		const result = await beforeController(
			boardsRouter,
			'post',
			'/:boardId/lists',
			{ boardId: id },
			{ name: 'Ready' },
		);
		expect(result.error).toBeUndefined();
		expect(result.request.body).toEqual({ name: 'Ready' });
		expect(permissionCheck).toHaveBeenCalledWith('CREATE_LIST');
		expect(lifecycleCheck).toHaveBeenCalledWith('write');
	});
});
