import { BoardRoleEnum, ProjectRoleEnum, UserRoleEnum } from '../../common/enums/roles';
import {
	BoardPermissionEnum,
	CardPermissionEnum,
	ListPermissionEnum,
	ProjectPermissionEnum,
} from '../../common/enums/permissions';

import {
	PermissionResource,
	PermissionRole,
	PermissionsRepository,
	ResourceState,
} from './permissions.repository';
import { NotFoundException, OptionalException } from '@/common/exceptions';

export type { PermissionResource } from './permissions.repository';
export type ResourceAction = 'write' | 'restore' | 'delete';

const viewerPermissions = new Set<string>([
	ProjectPermissionEnum.GET_PROJECT,
	BoardPermissionEnum.GET_BOARD,
	ListPermissionEnum.GET_LIST,
	CardPermissionEnum.GET_CARD,
]);

export class PermissionService {
	constructor(private readonly repository = new PermissionsRepository()) {}

	private assertActive(state: ResourceState, resource: string): void {
		if (state.status !== 'ACTIVE' || state.deletedAt) {
			throw new OptionalException(409, `${resource} is read-only`);
		}
	}

	async assertProjectLifecycle(
		resource: PermissionResource,
		action: ResourceAction = 'write',
	): Promise<void> {
		const projectId = await this.resolveProjectId(resource);
		const state = projectId
			? await this.repository.findProjectState(projectId)
			: null;
		if (!state) throw new NotFoundException('Project not found');
		if (action === 'write') this.assertActive(state, 'Project');
	}

	async assertListLifecycle(resource: PermissionResource): Promise<void> {
		await this.assertBoardLifecycle(resource);
		const list = await this.repository.findListState(resource);
		if (!list) throw new NotFoundException('List not found');
		this.assertActive(list, 'List');
	}

	async assertCardLifecycle(resource: PermissionResource): Promise<void> {
		await this.assertListLifecycle(resource);
		const card = await this.repository.findCardState(resource);
		if (!card) throw new NotFoundException('Card not found');
		this.assertActive(card, 'Card');
	}

	async assertBoardLifecycle(
		resource: PermissionResource,
		action: ResourceAction = 'write',
	): Promise<void> {
		// HTTP guard is an early rejection; mutation services repeat lifecycle checks under their parent locks.
		const boardId = await this.resolveBoardId(resource);
		const state = boardId ? await this.repository.findBoardState(boardId) : null;
		if (!state) throw new NotFoundException('Board not found');
		if (action !== 'delete') this.assertActive(state.project, 'Project');
		if (action === 'write') this.assertActive(state, 'Board');
	}

	private hasPermission(roles: PermissionRole[], permissions: string[]): boolean {
		return roles.some((role) => {
			const isViewer =
				role.name === ProjectRoleEnum.PROJECT_VIEWER ||
				role.name === BoardRoleEnum.BOARD_VIEWER;
			return permissions.some(
				(permission) =>
					(!isViewer || viewerPermissions.has(permission)) &&
					role.permissions.includes(permission),
			);
		});
	}

	private async isSystemAdmin(userId: string): Promise<boolean> {
		const roles = await this.repository.listSystemRoles(userId);
		return roles.some((role) => role.name === UserRoleEnum.ADMIN);
	}

	async hasProjectAdmin(userId: string, projectId: string): Promise<boolean> {
		if (await this.isSystemAdmin(userId)) return true;
		return (await this.repository.listProjectRoles(userId, projectId)).some(
			(role) => role.name === ProjectRoleEnum.PROJECT_ADMIN,
		);
	}

	async hasBoardAdmin(userId: string, boardId: string): Promise<boolean> {
		if (await this.isSystemAdmin(userId)) return true;
		if (
			(await this.repository.listBoardRoles(userId, boardId)).some(
				(role) => role.name === BoardRoleEnum.BOARD_ADMIN,
			)
		)
			return true;
		const projectId = await this.repository.findBoardProjectId(boardId);
		return (
			!!projectId &&
			(await this.repository.listProjectRoles(userId, projectId)).some(
				(role) => role.name === ProjectRoleEnum.PROJECT_ADMIN,
			)
		);
	}

	async hasSystemPermission(userId: string, permissions: string[]): Promise<boolean> {
		if (permissions.length === 0) return false;
		return this.hasPermission(
			await this.repository.listSystemRoles(userId),
			permissions,
		);
	}

	async hasProjectPermission(
		userId: string,
		projectId: string,
		permissions: string[],
	): Promise<boolean> {
		if (!projectId || permissions.length === 0) return false;
		if (await this.isSystemAdmin(userId)) return true;
		return this.hasPermission(
			await this.repository.listProjectRoles(userId, projectId),
			permissions,
		);
	}

	async hasBoardPermission(
		userId: string,
		boardId: string,
		permissions: string[],
	): Promise<boolean> {
		if (!boardId || permissions.length === 0) return false;
		if (await this.isSystemAdmin(userId)) return true;
		if (
			this.hasPermission(
				await this.repository.listBoardRoles(userId, boardId),
				permissions,
			)
		)
			return true;
		const projectId = await this.repository.findBoardProjectId(boardId);
		if (!projectId) return false;
		return this.hasPermission(
			await this.repository.listProjectRoles(userId, projectId),
			permissions,
		);
	}

	async resolveBoardId(resource: PermissionResource): Promise<string | null> {
		const keys = [
			'boardId',
			'listId',
			'cardId',
			'checklistId',
			'checklistItemId',
			'labelId',
			'commentId',
		] as const;
		const references = keys.filter((key) => resource[key]);
		if (references.length === 0) return null;
		const boardIds = await Promise.all(
			references.map((key) =>
				this.repository.findBoardId({ [key]: resource[key] }),
			),
		);
		const boardId = boardIds[0];
		if (boardIds.some((id) => id !== boardId)) return null;
		if (!boardId || (resource.boardId && resource.boardId !== boardId)) return null;
		if (resource.projectId) {
			const projectId = await this.repository.findBoardProjectId(boardId);
			if (projectId !== resource.projectId) return null;
		}
		return boardId;
	}

	async resolveProjectId(resource: PermissionResource): Promise<string | null> {
		const {
			projectId,
			boardId,
			listId,
			cardId,
			checklistId,
			checklistItemId,
			labelId,
			commentId,
		} = resource;
		if (
			[
				boardId,
				listId,
				cardId,
				checklistId,
				checklistItemId,
				labelId,
				commentId,
			].some(Boolean)
		) {
			const boardId = await this.resolveBoardId(resource);
			return boardId ? this.repository.findBoardProjectId(boardId) : null;
		}
		return projectId ? this.repository.findProjectId(projectId) : null;
	}
}
