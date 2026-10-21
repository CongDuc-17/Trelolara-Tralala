import 'reflect-metadata';
import type { Request, Response } from 'express';
import { AuthMiddleware } from '@/common/middlewares/auth.middleware';
import { AuthService } from '@/modules/auth/auth.service';
import { PermissionService } from '@/modules/permissions/permission.service';
import {
	PermissionsRepository,
	PermissionRole,
} from '@/modules/permissions/permissions.repository';
import { prisma } from '@/modules/database';

jest.mock('@/modules/database', () => ({ prisma: { roles: { findUnique: jest.fn() } } }));

const projectId = 'b86047cc-6630-4bba-bce7-dfb9ecc8433a';
const boardId = '381db42c-f68f-41e2-9fcd-fc92d77cf583';
const roleId = '7109d174-8485-4c08-ac15-79614f4d5c66';

function setup() {
	const active = () => ({ status: 'ACTIVE', deletedAt: null as Date | null });
	const repository = {
		findProjectId: jest.fn(async () => projectId as string | null),
		findBoardId: jest.fn(async () => boardId as string | null),
		findBoardProjectId: jest.fn(async () => projectId),
		findProjectState: jest.fn(async () => active()),
		findListState: jest.fn(async () => active() as ReturnType<typeof active> | null),
		findBoardState: jest.fn(async () => ({ ...active(), project: active() })),
		listSystemRoles: jest.fn(async () => [] as PermissionRole[]),
		listProjectRoles: jest.fn(async () => [] as PermissionRole[]),
		listBoardRoles: jest.fn(async () => [] as PermissionRole[]),
	};
	const service = new PermissionService(repository as unknown as PermissionsRepository);
	return {
		repository,
		service,
		middleware: new AuthMiddleware({} as AuthService, service),
	};
}

describe('Project and board lifecycle policy', () => {
	it('keeps archived list descendants read-only and checks their list after the ancestors', async () => {
		const { service, repository } = setup();
		repository.findListState.mockResolvedValue({
			status: 'ARCHIVED',
			deletedAt: new Date(),
		});
		for (const key of [
			'listId',
			'cardId',
			'checklistId',
			'checklistItemId',
			'commentId',
		]) {
			await expect(
				service.assertListLifecycle({ [key]: roleId }),
			).rejects.toMatchObject({ status: 409 });
			expect(repository.findListState).toHaveBeenLastCalledWith({ [key]: roleId });
		}
		expect(repository.findBoardState.mock.invocationCallOrder[0]).toBeLessThan(
			repository.findListState.mock.invocationCallOrder[0],
		);
	});

	it('allows a child write in an active list and rejects a missing or legacy-deleted list', async () => {
		const { service, repository } = setup();
		await expect(
			service.assertListLifecycle({ cardId: roleId }),
		).resolves.toBeUndefined();
		repository.findListState.mockResolvedValueOnce(null);
		await expect(
			service.assertListLifecycle({ cardId: roleId }),
		).rejects.toMatchObject({ status: 404 });
		repository.findListState.mockResolvedValueOnce({
			status: 'ACTIVE',
			deletedAt: new Date(),
		});
		await expect(
			service.assertListLifecycle({ cardId: roleId }),
		).rejects.toMatchObject({ status: 409 });
	});
	it.each(['ARCHIVED', 'DELETED'])(
		'blocks project writes when %s without changing child statuses',
		async (status) => {
			const { repository, service } = setup();
			repository.findProjectState.mockResolvedValueOnce({
				status,
				deletedAt: null,
			});
			await expect(
				service.assertProjectLifecycle({ projectId }),
			).rejects.toMatchObject({ status: 409 });
			expect(repository.findBoardState).not.toHaveBeenCalled();
		},
	);

	it('treats deletedAt as read-only even if a legacy status is active', async () => {
		const { repository, service } = setup();
		repository.findProjectState.mockResolvedValueOnce({
			status: 'ACTIVE',
			deletedAt: new Date(),
		});
		await expect(service.assertProjectLifecycle({ projectId })).rejects.toMatchObject(
			{ status: 409 },
		);
	});

	it.each(['ARCHIVED', 'DELETED'])(
		'blocks descendant writes and board restore while the project is %s',
		async (status) => {
			const { repository, service } = setup();
			repository.findBoardState.mockResolvedValue({
				status: 'ACTIVE',
				deletedAt: null,
				project: { status, deletedAt: null },
			});
			await expect(
				service.assertBoardLifecycle({ cardId: roleId }),
			).rejects.toMatchObject({ status: 409 });
			await expect(
				service.assertBoardLifecycle({ boardId }, 'restore'),
			).rejects.toMatchObject({ status: 409 });
		},
	);

	it('allows restore of an archived board only with an active project, and allows explicit deletion', async () => {
		const { repository, service } = setup();
		repository.findBoardState.mockResolvedValue({
			status: 'ARCHIVED',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		});
		await expect(service.assertBoardLifecycle({ boardId })).rejects.toMatchObject({
			status: 409,
		});
		await expect(
			service.assertBoardLifecycle({ boardId }, 'restore'),
		).resolves.toBeUndefined();
		repository.findBoardState.mockResolvedValueOnce({
			status: 'ARCHIVED',
			deletedAt: null,
			project: { status: 'ARCHIVED', deletedAt: null },
		});
		await expect(
			service.assertBoardLifecycle({ boardId }, 'delete'),
		).resolves.toBeUndefined();
	});

	it('resolves every child identifier before applying the actual board state', async () => {
		const { repository, service } = setup();
		for (const key of [
			'listId',
			'cardId',
			'labelId',
			'checklistId',
			'checklistItemId',
			'commentId',
		]) {
			await service.assertBoardLifecycle({ [key]: roleId });
			expect(repository.findBoardId).toHaveBeenLastCalledWith({ [key]: roleId });
			expect(repository.findBoardState).toHaveBeenLastCalledWith(boardId);
		}
	});

	it('fails closed for a missing or mismatched resource', async () => {
		const { repository, service } = setup();
		repository.findBoardId.mockResolvedValueOnce(null);
		await expect(service.assertBoardLifecycle({ boardId })).rejects.toMatchObject({
			status: 404,
		});
		expect(repository.findBoardState).not.toHaveBeenCalled();
	});

	it('validates resource IDs before queries and forwards lifecycle failures to Express', async () => {
		const { repository, middleware } = setup();
		const next = jest.fn();
		await middleware.verifyBoardLifecycle()(
			{ params: { boardId: 'invalid' } } as unknown as Request,
			{} as Response,
			next,
		);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
		expect(repository.findBoardId).not.toHaveBeenCalled();
		next.mockClear();
		repository.findBoardState.mockResolvedValueOnce({
			status: 'ARCHIVED',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		});
		await middleware.verifyBoardLifecycle()(
			{ params: { boardId } } as unknown as Request,
			{} as Response,
			next,
		);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
	});
});

describe('Admin authority for granting invitation roles', () => {
	it('does not mistake a custom role with UPDATE_MEMBER_ROLE for a project admin', async () => {
		const { service, repository } = setup();
		repository.listProjectRoles.mockResolvedValue([
			{ name: 'PROJECT_MANAGER', permissions: ['UPDATE_MEMBER_ROLE'] },
		]);
		await expect(service.hasProjectAdmin('actor', projectId)).resolves.toBe(false);
		repository.listProjectRoles.mockResolvedValue([
			{ name: 'PROJECT_ADMIN', permissions: [] },
		]);
		await expect(service.hasProjectAdmin('actor', projectId)).resolves.toBe(true);
		await expect(service.hasBoardAdmin('actor', boardId)).resolves.toBe(true);
	});

	it('preserves literal system ADMIN authority without a membership', async () => {
		const { service, repository } = setup();
		repository.listSystemRoles.mockResolvedValue([
			{ name: 'ADMIN', permissions: [] },
		]);
		await expect(service.hasProjectAdmin('actor', projectId)).resolves.toBe(true);
		await expect(service.hasBoardAdmin('actor', boardId)).resolves.toBe(true);
	});

	it.each(['PROJECT_ADMIN', 'PROJECT_MANAGER'])(
		'requires actual admin authority to invite using %s',
		async (name) => {
			const { middleware } = setup();
			jest.mocked(prisma.roles.findUnique).mockResolvedValueOnce({
				id: roleId,
				name,
				status: 'ACTIVE',
				deletedAt: null,
			} as Awaited<ReturnType<typeof prisma.roles.findUnique>>);
			const next = jest.fn();
			await middleware.verifyInvitationRole('project')(
				{
					user: { id: 'actor' },
					params: { projectId },
					body: { roleId },
				} as unknown as Request,
				{} as Response,
				next,
			);
			expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
		},
	);

	it.each(['PROJECT_MEMBER', 'PROJECT_VIEWER'])(
		'retains ordinary invite grants for %s',
		async (name) => {
			const { middleware } = setup();
			jest.mocked(prisma.roles.findUnique).mockResolvedValueOnce({
				id: roleId,
				name,
				status: 'ACTIVE',
				deletedAt: null,
			} as Awaited<ReturnType<typeof prisma.roles.findUnique>>);
			const next = jest.fn();
			await middleware.verifyInvitationRole('project')(
				{
					user: { id: 'actor' },
					params: { projectId },
					body: { roleId },
				} as unknown as Request,
				{} as Response,
				next,
			);
			expect(next).toHaveBeenCalledWith();
		},
	);
});
