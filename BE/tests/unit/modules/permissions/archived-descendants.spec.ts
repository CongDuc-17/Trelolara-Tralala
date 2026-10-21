import 'reflect-metadata';
import type { Request, RequestHandler, Response, Router } from 'express';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import { listsRouter } from '@/modules/lists/list.router';
import { cardsRouter } from '@/modules/cards/card.router';
import { labelsRouter } from '@/modules/labels/labels.router';
import { commentsRouter } from '@/modules/comments/comments.router';
import { checklistsRouter } from '@/modules/checklists/checklists.router';
import { checklistItemsRouter } from '@/modules/checklistItems/checklistItems.router';
import { InvitationService } from '@/modules/invitations/invitation.service';
import { InvitationsRepository } from '@/modules/invitations/invitation.repository';
import { ProjectMembersRepository } from '@/modules/projectMembers/projectMember.repository';
import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import { PermissionService } from '@/modules/permissions/permission.service';

jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (_req, _res, next) => next();
	actual.default.verifyBoardPermission = () => (_req, _res, next) => next();
	return actual;
});

const id = 'e81da272-2fbf-47fc-a1af-7cd510086071';

function runRoute(
	router: Router,
	path: string,
	params: object,
	body: object,
	method = 'patch',
): Promise<unknown> {
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
	const handlers = layers.find(
		(layer) => layer.route.path === path && layer.route.methods[method],
	)!.route.stack;
	const request = { params, body, query: {}, user: { id } } as Request;
	const response = { locals: {} } as Response;
	let index = 0;
	return new Promise((resolve, reject) => {
		const next = (error?: unknown) => {
			if (error) {
				resolve(error);
				return;
			}
			const handler = handlers[index++]?.handle;
			if (!handler) {
				reject(new Error('Archived mutation reached controller'));
				return;
			}
			try {
				Promise.resolve(handler(request, response, next)).catch(resolve);
			} catch (failure) {
				resolve(failure);
			}
		};
		next();
	});
}

describe('Archive guards on descendant routes', () => {
	beforeEach(() => {
		jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
		jest.spyOn(PermissionsRepository.prototype, 'findBoardState').mockResolvedValue({
			status: 'ARCHIVED',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		});
	});
	it.each([
		[
			cardsRouter,
			'/:cardId/checklists',
			{ cardId: id },
			{ title: 'New checklist' },
			'post',
		],
		[
			cardsRouter,
			'/:cardId/comments',
			{ cardId: id },
			{ content: 'New comment' },
			'post',
		],
		[
			commentsRouter,
			'/:commentId',
			{ commentId: id },
			{ content: 'Updated' },
			'patch',
		],
		[
			checklistsRouter,
			'/:checklistId',
			{ checklistId: id },
			{ title: 'Updated' },
			'patch',
		],
		[
			checklistItemsRouter,
			'/:checklistItemId',
			{ checklistItemId: id },
			{ completed: false },
			'patch',
		],
	] as const)(
		'blocks child writes to an archived card (%s)',
		async (router, path, params, body, method) => {
			jest.mocked(PermissionsRepository.prototype.findBoardState).mockResolvedValue(
				{
					status: 'ACTIVE',
					deletedAt: null,
					project: { status: 'ACTIVE', deletedAt: null },
				},
			);
			jest.spyOn(
				PermissionsRepository.prototype,
				'findListState',
			).mockResolvedValue({ status: 'ACTIVE', deletedAt: null });
			jest.spyOn(
				PermissionsRepository.prototype,
				'findCardState',
			).mockResolvedValue({ status: 'ARCHIVED', deletedAt: new Date() });
			await expect(
				runRoute(router, path, params, body, method),
			).resolves.toMatchObject({ status: 409 });
		},
	);

	it.each([
		[listsRouter, '/:listId/cards', { listId: id }, { title: 'New card' }, 'post'],
		[cardsRouter, '/:cardId/move', { cardId: id }, { targetListId: id }, 'patch'],
		[cardsRouter, '/:cardId/restore', { cardId: id }, {}, 'patch'],
		[
			commentsRouter,
			'/:commentId',
			{ commentId: id },
			{ content: 'Updated' },
			'patch',
		],
		[
			checklistsRouter,
			'/:checklistId',
			{ checklistId: id },
			{ title: 'Updated' },
			'patch',
		],
		[
			checklistItemsRouter,
			'/:checklistItemId',
			{ checklistItemId: id },
			{ completed: false },
			'patch',
		],
	] as const)(
		'blocks card descendants in an archived list with an active board (%s)',
		async (router, path, params, body, method) => {
			jest.mocked(PermissionsRepository.prototype.findBoardState).mockResolvedValue(
				{
					status: 'ACTIVE',
					deletedAt: null,
					project: { status: 'ACTIVE', deletedAt: null },
				},
			);
			jest.spyOn(
				PermissionsRepository.prototype,
				'findListState',
			).mockResolvedValue({ status: 'ARCHIVED', deletedAt: new Date() });
			await expect(
				runRoute(router, path, params, body, method),
			).resolves.toMatchObject({
				status: 409,
			});
		},
	);

	it.each([
		[listsRouter, '/:listId/move', { listId: id }, {}],
		[cardsRouter, '/:cardId/move', { cardId: id }, { targetListId: id }],
		[
			labelsRouter,
			'/:labelId',
			{ labelId: id },
			{ name: 'Updated', color: '#ffffff' },
		],
		[commentsRouter, '/:commentId', { commentId: id }, { content: 'Updated' }],
		[checklistsRouter, '/:checklistId', { checklistId: id }, { title: 'Updated' }],
		[
			checklistItemsRouter,
			'/:checklistItemId',
			{ checklistItemId: id },
			{ completed: false },
		],
	] as const)(
		'blocks an authorized mutation under an archived board before business writes (%s)',
		async (router, path, params, body) => {
			await expect(runRoute(router, path, params, body)).resolves.toMatchObject({
				status: 409,
			});
		},
	);
});

describe('Invitation acceptance respects parent lifecycle', () => {
	it.each(['project', 'board'] as const)(
		'checks an archived %s inside the acceptance transaction',
		async (scope) => {
			const record = {
				id,
				projectId: scope === 'project' ? id : null,
				boardId: scope === 'board' ? id : null,
				type: 'EMAIL',
				expiresAt: new Date(Date.now() + 60000),
				status: 'PENDING',
			};
			const repository = {
				findByToken: jest.fn().mockResolvedValue(record),
				lockTarget: jest.fn(),
				lockInvitation: jest.fn(),
				getTarget: jest.fn().mockResolvedValue({
					id,
					scope,
					status: 'ARCHIVED',
					deletedAt: null,
				}),
				createMember: jest.fn(),
				inTransaction: jest.fn(),
			};
			repository.inTransaction.mockImplementation(
				(work: (repo: typeof repository) => Promise<unknown>) => work(repository),
			);
			const service = new InvitationService(
				repository as unknown as InvitationsRepository,
			);
			await expect(service.acceptInvitation('token', id)).rejects.toMatchObject({
				status: 409,
			});
			expect(repository.lockTarget).toHaveBeenCalledWith(scope, id);
			expect(repository.createMember).not.toHaveBeenCalled();
		},
	);
});
