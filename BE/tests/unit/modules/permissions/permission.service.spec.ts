import { RoleStatusEnum } from '@prisma/client';

jest.mock('@/modules/database', () => ({ prisma: {} }));

import { PermissionService } from '@/modules/permissions/permission.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import type { DatabaseClient } from '@/modules/database';

function createPolicy() {
	const repository = {
		listSystemRoles: jest
			.fn<Promise<{ name: string; permissions: string[] }[]>, [string]>()
			.mockResolvedValue([]),
		listProjectRoles: jest
			.fn<Promise<{ name: string; permissions: string[] }[]>, [string, string]>()
			.mockResolvedValue([]),
		listBoardRoles: jest
			.fn<Promise<{ name: string; permissions: string[] }[]>, [string, string]>()
			.mockResolvedValue([]),
		findBoardProjectId: jest
			.fn<Promise<string | null>, [string]>()
			.mockResolvedValue('project-1'),
		findBoardId: jest
			.fn<Promise<string | null>, [object]>()
			.mockResolvedValue('board-1'),
		findProjectId: jest
			.fn<Promise<string | null>, [string]>()
			.mockResolvedValue('project-1'),
	};
	return {
		repository,
		service: new PermissionService(repository as unknown as PermissionsRepository),
	};
}

describe('PermissionService scope policy', () => {
	it('allows listing my projects without granting access to a different project', async () => {
		const { repository, service } = createPolicy();
		repository.listSystemRoles.mockResolvedValue([
			{ name: 'USER', permissions: ['GET_PROJECT'] },
		]);
		expect(await service.hasSystemPermission('user-1', ['GET_PROJECT'])).toBe(true);
		expect(
			await service.hasProjectPermission('user-1', 'project-2', ['GET_PROJECT']),
		).toBe(false);
		expect(repository.listProjectRoles).toHaveBeenCalledWith('user-1', 'project-2');
	});

	it('preserves active system ADMIN access without membership', async () => {
		const { repository, service } = createPolicy();
		repository.listSystemRoles.mockResolvedValue([
			{ name: 'ADMIN', permissions: [] },
		]);
		expect(
			await service.hasProjectPermission('admin', 'project-1', ['DELETE_PROJECT']),
		).toBe(true);
		expect(
			await service.hasBoardPermission('admin', 'board-1', ['DELETE_CARD']),
		).toBe(true);
		expect(repository.listProjectRoles).not.toHaveBeenCalled();
		expect(repository.listBoardRoles).not.toHaveBeenCalled();
	});

	it('inherits permission only from the parent project of the target board', async () => {
		const { repository, service } = createPolicy();
		repository.listProjectRoles.mockResolvedValue([
			{ name: 'PROJECT_ADMIN', permissions: ['UPDATE_CARD'] },
		]);
		expect(
			await service.hasBoardPermission('user-1', 'board-1', ['UPDATE_CARD']),
		).toBe(true);
		expect(repository.listBoardRoles).toHaveBeenCalledWith('user-1', 'board-1');
		expect(repository.listProjectRoles).toHaveBeenCalledWith('user-1', 'project-1');
	});

	it.each(['PROJECT_VIEWER', 'BOARD_VIEWER'])(
		'denies writes for %s even with a stale write grant',
		async (name) => {
			const { repository, service } = createPolicy();
			const role = { name, permissions: ['GET_CARD', 'UPDATE_CARD'] };
			if (name === 'PROJECT_VIEWER')
				repository.listProjectRoles.mockResolvedValue([role]);
			else repository.listBoardRoles.mockResolvedValue([role]);
			expect(
				await service.hasBoardPermission('viewer', 'board-1', ['GET_CARD']),
			).toBe(true);
			expect(
				await service.hasBoardPermission('viewer', 'board-1', ['UPDATE_CARD']),
			).toBe(false);
		},
	);

	it('uses scoped grants for custom roles without interpreting them as system ADMIN', async () => {
		const { repository, service } = createPolicy();
		repository.listSystemRoles.mockResolvedValue([
			{ name: 'CUSTOM', permissions: ['UPDATE_CARD'] },
		]);
		expect(
			await service.hasBoardPermission('user-1', 'board-1', ['UPDATE_CARD']),
		).toBe(false);
		repository.listBoardRoles.mockResolvedValue([
			{ name: 'CUSTOM', permissions: ['UPDATE_CARD'] },
		]);
		expect(
			await service.hasBoardPermission('user-1', 'board-1', ['UPDATE_CARD']),
		).toBe(true);
	});

	it('fails closed when no permissions are requested or a target parent does not exist', async () => {
		const { repository, service } = createPolicy();
		expect(await service.hasSystemPermission('user-1', [])).toBe(false);
		expect(await service.hasProjectPermission('user-1', 'project-1', [])).toBe(false);
		repository.findBoardProjectId.mockResolvedValue(null);
		expect(await service.hasBoardPermission('user-1', 'missing', ['GET_CARD'])).toBe(
			false,
		);
	});

	it('rejects a parent ID that disagrees with the actual resource ancestry', async () => {
		const { service } = createPolicy();
		expect(
			await service.resolveBoardId({
				checklistItemId: 'item-1',
				boardId: 'board-2',
			}),
		).toBeNull();
		expect(
			await service.resolveBoardId({ labelId: 'label-1', projectId: 'project-2' }),
		).toBeNull();
		expect(
			await service.resolveProjectId({ cardId: 'card-1', projectId: 'project-2' }),
		).toBeNull();
	});

	it('propagates database failures instead of granting permission', async () => {
		const { repository, service } = createPolicy();
		repository.listSystemRoles.mockRejectedValue(new Error('database unavailable'));
		await expect(
			service.hasBoardPermission('user-1', 'board-1', ['GET_CARD']),
		).rejects.toThrow('database unavailable');
	});
});

describe('PermissionsRepository resource lookup', () => {
	it('rejects mixed card and label references from different boards', async () => {
		const client = {
			cards: {
				findUnique: jest.fn().mockResolvedValue({ list: { boardId: 'board-1' } }),
			},
			labels: { findUnique: jest.fn().mockResolvedValue({ boardId: 'board-2' }) },
		};
		const service = new PermissionService(
			new PermissionsRepository(client as unknown as DatabaseClient),
		);
		expect(
			await service.resolveBoardId({ cardId: 'card-1', labelId: 'label-2' }),
		).toBeNull();
	});

	it.each([
		['boardId', 'boards', { id: 'board-1' }],
		['listId', 'lists', { boardId: 'board-1' }],
		['cardId', 'cards', { list: { boardId: 'board-1' } }],
		['checklistId', 'checklists', { card: { list: { boardId: 'board-1' } } }],
		[
			'checklistItemId',
			'checklistItems',
			{ checklist: { card: { list: { boardId: 'board-1' } } } },
		],
		['labelId', 'labels', { boardId: 'board-1' }],
		['commentId', 'cardComments', { card: { list: { boardId: 'board-1' } } }],
	])(
		'resolves %s through its actual parent relations',
		async (key, delegate, record) => {
			const findUnique = jest.fn().mockResolvedValue(record);
			const repository = new PermissionsRepository({
				[delegate as string]: { findUnique },
			} as unknown as DatabaseClient);
			expect(await repository.findBoardId({ [key as string]: 'resource-1' })).toBe(
				'board-1',
			);
			expect(findUnique).toHaveBeenCalledWith(
				expect.objectContaining({ where: { id: 'resource-1' } }),
			);
			findUnique.mockResolvedValue(null);
			expect(
				await repository.findBoardId({ [key as string]: 'missing' }),
			).toBeNull();
		},
	);

	it('excludes inactive or deleted roles and deleted permission records from grants', async () => {
		const findMany = jest.fn().mockResolvedValue([
			{
				name: 'CUSTOM',
				rolesPermissions: [{ permission: { name: 'GET_BOARD' } }],
			},
		]);
		const repository = new PermissionsRepository({
			roles: { findMany },
		} as unknown as DatabaseClient);
		expect(await repository.listBoardRoles('user-1', 'board-1')).toEqual([
			{ name: 'CUSTOM', permissions: ['GET_BOARD'] },
		]);
		expect(findMany).toHaveBeenCalledWith({
			where: {
				boardMembers: { some: { userId: 'user-1', boardId: 'board-1' } },
				status: RoleStatusEnum.ACTIVE,
				deletedAt: null,
			},
			select: {
				name: true,
				rolesPermissions: {
					where: {
						permission: {
							deletedAt: null,
						},
					},
					select: { permission: { select: { name: true } } },
				},
			},
		});
	});
});
