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
} from './permissions.repository';

export type { PermissionResource } from './permissions.repository';

const viewerPermissions = new Set<string>([
	ProjectPermissionEnum.GET_PROJECT,
	BoardPermissionEnum.GET_BOARD,
	ListPermissionEnum.GET_LIST,
	CardPermissionEnum.GET_CARD,
]);

export class PermissionService {
	constructor(private readonly repository = new PermissionsRepository()) {}

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
