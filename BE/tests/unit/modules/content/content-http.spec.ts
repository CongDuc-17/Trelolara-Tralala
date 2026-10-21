import 'reflect-metadata';
import type { Request, RequestHandler, Response, Router } from 'express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { checklistsRouter } from '@/modules/checklists/checklists.router';
import { checklistItemsRouter } from '@/modules/checklistItems/checklistItems.router';
import { commentsRouter } from '@/modules/comments/comments.router';
import {
	invitationsRouter,
	invitationsRegistry,
} from '@/modules/invitations/invitation.router';
import { ChecklistsController } from '@/modules/checklists/checklists.controller';
import { ChecklistsService } from '@/modules/checklists/checklists.service';
import { ChecklistItemsController } from '@/modules/checklistItems/checklistItems.controller';
import { ChecklistItemsService } from '@/modules/checklistItems/checklistItems.service';
import { CommentsController } from '@/modules/comments/comments.controller';
import { CommentsService } from '@/modules/comments/comments.service';
import { InvitationController } from '@/modules/invitations/invitation.controller';
import { InvitationService } from '@/modules/invitations/invitation.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (_req, _res, next) => next();
	return actual;
});
const id = 'ea24f45c-f7b7-4d1c-89b7-0fb53ecb2e43';
function beforeController(
	router: Router,
	method: string,
	path: string,
	params: object,
	body: object = {},
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
	const request = { params, body, query: {}, user: { id } } as Request;
	const response = { locals: {} } as Response;
	let index = 0;
	return new Promise<{ error?: unknown; request: Request }>((resolve, reject) => {
		const next = (error?: unknown) => {
			if (error || index === route.stack.length - 1)
				return resolve({ error, request });
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
describe('Content and invitation route validation/security', () => {
	beforeEach(() => {
		jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
		jest.spyOn(PermissionsRepository.prototype, 'findProjectId').mockResolvedValue(
			id,
		);
		jest.spyOn(
			PermissionsRepository.prototype,
			'findBoardProjectId',
		).mockResolvedValue(id);
		jest.spyOn(PermissionsRepository.prototype, 'listSystemRoles').mockResolvedValue(
			[],
		);
		jest.spyOn(PermissionsRepository.prototype, 'listProjectRoles').mockResolvedValue(
			[],
		);
		jest.spyOn(PermissionsRepository.prototype, 'listBoardRoles').mockResolvedValue(
			[],
		);
	});
	it.each([
		[
			checklistsRouter,
			'patch',
			'/:checklistId',
			{ checklistId: 'bad' },
			{ title: 'Tasks' },
		],
		[checklistItemsRouter, 'patch', '/:checklistItemId', { checklistItemId: id }, {}],
		[
			checklistItemsRouter,
			'delete',
			'/:checklistItemId',
			{ checklistItemId: 'bad' },
			{},
		],
		[commentsRouter, 'patch', '/:commentId', { commentId: id }, { content: '' }],
		[
			commentsRouter,
			'patch',
			'/:commentId',
			{ commentId: 'bad' },
			{ content: 'After' },
		],
		[
			invitationsRouter,
			'post',
			'/projects/:projectId',
			{ projectId: id },
			{ email: 'bad' },
		],
		[
			invitationsRouter,
			'post',
			'/boards/:boardId',
			{ boardId: id },
			{ email: 'recipient@example.com', roleId: 'bad' },
		],
		[
			invitationsRouter,
			'post',
			'/projects/:projectId/share-link',
			{ projectId: id },
			{ roleId: 'bad' },
		],
		[
			invitationsRouter,
			'post',
			'/boards/:boardId/share-link',
			{ boardId: 'bad' },
			{},
		],
		[invitationsRouter, 'post', '/:token/accept', { token: '' }, {}],
		[invitationsRouter, 'post', '/:token/reject', { token: '' }, {}],
	] as const)(
		'validates %s %s %s before resource queries',
		async (router, method, path, params, body) => {
			expect(
				(await beforeController(router, method, path, params, body)).error,
			).toMatchObject({ status: 422 });
			expect(PermissionsRepository.prototype.findBoardId).not.toHaveBeenCalled();
			expect(PermissionsRepository.prototype.findProjectId).not.toHaveBeenCalled();
		},
	);
	it.each([
		[
			checklistsRouter,
			'patch',
			'/:checklistId',
			{ checklistId: id },
			{ title: 'Tasks' },
		],
		[
			checklistItemsRouter,
			'patch',
			'/:checklistItemId',
			{ checklistItemId: id },
			{ completed: false },
		],
		[
			checklistItemsRouter,
			'delete',
			'/:checklistItemId',
			{ checklistItemId: id },
			{},
		],
		[commentsRouter, 'patch', '/:commentId', { commentId: id }, { content: 'After' }],
		[
			invitationsRouter,
			'post',
			'/projects/:projectId',
			{ projectId: id },
			{ email: 'recipient@example.com' },
		],
		[
			invitationsRouter,
			'post',
			'/boards/:boardId',
			{ boardId: id },
			{ email: 'recipient@example.com' },
		],
	] as const)(
		'denies an outsider on %s %s %s',
		async (router, method, path, params, body) => {
			expect(
				(await beforeController(router, method, path, params, body)).error,
			).toMatchObject({ status: 403 });
		},
	);
	it('retains completed:false after parsing and blocks legacy viewer write grants', async () => {
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([
			{ name: 'BOARD_MEMBER', permissions: ['UPDATE_CARD'] },
		]);
		jest.spyOn(PermissionsRepository.prototype, 'findBoardState').mockResolvedValue({
			status: 'ACTIVE',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		});
		jest.spyOn(PermissionsRepository.prototype, 'findListState').mockResolvedValue({
			status: 'ACTIVE',
			deletedAt: null,
		});
		jest.spyOn(PermissionsRepository.prototype, 'findCardState').mockResolvedValue({
			status: 'ACTIVE',
			deletedAt: null,
		});
		const result = await beforeController(
			checklistItemsRouter,
			'patch',
			'/:checklistItemId',
			{ checklistItemId: id },
			{ completed: false },
		);
		expect(result.error).toBeUndefined();
		expect(result.request.body).toEqual({ completed: false });
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([
			{ name: 'BOARD_VIEWER', permissions: ['UPDATE_CARD'] },
		]);
		expect(
			(
				await beforeController(
					commentsRouter,
					'patch',
					'/:commentId',
					{ commentId: id },
					{ content: 'After' },
				)
			).error,
		).toMatchObject({ status: 403 });
	});
	it('keeps six invitation routes and documents string accept/reject and delivery status', () => {
		const document = new OpenApiGeneratorV3(
			invitationsRegistry.definitions,
		).generateDocument({
			openapi: '3.0.0',
			info: { title: 'Invitations', version: '1' },
		});
		expect(Object.keys(document.paths)).toHaveLength(6);
		expect(
			document.paths['/invitations/{token}/accept']?.post?.responses['200'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: { properties: { data: { type: 'string' } } },
				},
			},
		});
		expect(
			document.paths['/invitations/boards/{boardId}']?.post?.responses['200'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: {
						properties: {
							data: {
								properties: {
									delivery: { type: 'object' },
									expiresAt: { type: 'string' },
								},
							},
						},
					},
				},
			},
		});
	});
});
describe('Content and invitation HTTP response compatibility', () => {
	it('keeps checklist raw nested items, item isCompleted:false, null deletion and commentId fields', async () => {
		const now = new Date();
		const item = {
			id,
			checklistId: id,
			title: 'Task',
			completed: false,
			createdAt: now,
		};
		const checklist = {
			id,
			cardId: id,
			title: 'Tasks',
			createdAt: now,
			checklistItems: [item],
		};
		const json = jest.fn().mockReturnThis();
		const res = { json } as unknown as Response;
		const req = {
			params: { checklistId: id, checklistItemId: id, cardId: id },
			body: { title: 'Task', completed: false, content: 'After' },
			user: { id },
		} as unknown as Request;
		const checklists = new ChecklistsController({
			getChecklistById: jest.fn().mockResolvedValue(checklist),
		} as unknown as ChecklistsService);
		await checklists.getChecklistById(req, res);
		expect(json).toHaveBeenLastCalledWith({
			success: true,
			data: { id, cardId: id, title: 'Tasks', checklistItems: [item] },
		});
		const items = new ChecklistItemsController({
			updateChecklistItem: jest.fn().mockResolvedValue(item),
			deleteChecklistItem: jest.fn(),
		} as unknown as ChecklistItemsService);
		await items.updateChecklistItem(req, res);
		expect(json).toHaveBeenLastCalledWith({
			success: true,
			data: { id, checklistId: id, title: 'Task', isCompleted: false },
		});
		await items.deleteChecklistItem(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: null });
		const comment = {
			id,
			cardId: id,
			userId: id,
			user: { id, name: 'Author', email: 'author@example.com', avatar: null },
			content: 'After',
			createdAt: now,
			updatedAt: now,
		};
		const comments = new CommentsController({
			createComment: jest.fn().mockResolvedValue(comment),
		} as unknown as CommentsService);
		await comments.createComment(req, res);
		expect(json).toHaveBeenLastCalledWith({
			success: true,
			data: {
				commentId: id,
				cardId: id,
				user: comment.user,
				content: 'After',
				createdAt: now,
				updatedAt: now,
			},
		});
	});
	it('retains the invitation envelope with old fields plus pending/delivery data and plain acceptance string', async () => {
		const row = {
			id,
			token: 'token',
			email: 'recipient@example.com',
			boardId: id,
			roleId: id,
			inviterId: id,
			type: 'EMAIL',
			status: 'PENDING',
			expiresAt: new Date(),
			delivery: { email: 'FAILED', notification: 'SENT' },
		};
		const service = {
			inviteUserToBoard: jest.fn().mockResolvedValue(row),
			acceptInvitation: jest
				.fn()
				.mockResolvedValue('Invitation accepted successfully'),
		};
		const controller = new InvitationController(
			service as unknown as InvitationService,
		);
		const json = jest.fn().mockReturnThis();
		const res = { json } as unknown as Response;
		const req = {
			params: { boardId: id, token: 'token' },
			user: { id },
			body: { email: row.email },
		} as unknown as Request;
		await controller.inviteUserToBoard(req, res);
		expect(json).toHaveBeenLastCalledWith({ success: true, data: row });
		expect(service.inviteUserToBoard).toHaveBeenCalledWith(
			id,
			id,
			row.email,
			undefined,
		);
		await controller.acceptInvitation(req, res);
		expect(json).toHaveBeenLastCalledWith({
			success: true,
			data: 'Invitation accepted successfully',
		});
	});
});
