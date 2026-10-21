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
	it.each(['project', 'board'])(
		'checks an archived %s before creating membership or accepting the invitation',
		async (target) => {
			const repository = {
				findByToken: jest.fn().mockResolvedValue({
					id,
					projectId: target === 'project' ? id : null,
					boardId: target === 'board' ? id : null,
					expiresAt: new Date(Date.now() + 60_000),
					status: 'PENDING',
				}),
				updateStatus: jest.fn(),
			};
			const projectMembers = {
				isUserMemberOfProject: jest.fn(),
				assignUserRoleProject: jest.fn(),
			};
			const boardMembers = {
				isUserMemberOfBoard: jest.fn(),
				assignUserRoleBoard: jest.fn(),
			};
			const conflict = Object.assign(new Error('Read-only'), { status: 409 });
			const permissions = {
				assertProjectLifecycle: jest.fn().mockRejectedValue(conflict),
				assertBoardLifecycle: jest.fn().mockRejectedValue(conflict),
			};
			const service = new InvitationService(
				repository as unknown as InvitationsRepository,
				undefined,
				projectMembers as unknown as ProjectMembersRepository,
				boardMembers as unknown as BoardMembersRepository,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				permissions as unknown as PermissionService,
			);
			await expect(service.acceptInvitation('token', id)).rejects.toBe(conflict);
			expect(projectMembers.assignUserRoleProject).not.toHaveBeenCalled();
			expect(boardMembers.assignUserRoleBoard).not.toHaveBeenCalled();
			expect(repository.updateStatus).not.toHaveBeenCalled();
		},
	);
});
