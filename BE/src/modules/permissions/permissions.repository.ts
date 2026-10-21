import { Prisma, RoleStatusEnum } from '@prisma/client';

import { DatabaseClient, prisma } from '../database';

export interface PermissionRole {
	name: string;
	permissions: string[];
}

export interface PermissionResource {
	projectId?: string;
	boardId?: string;
	listId?: string;
	cardId?: string;
	checklistId?: string;
	checklistItemId?: string;
	labelId?: string;
	commentId?: string;
}

export interface ResourceState {
	status: string;
	deletedAt: Date | null;
}

export class PermissionsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}

	findProjectState(projectId: string): Promise<ResourceState | null> {
		return this.client.projects.findUnique({
			where: { id: projectId },
			select: { status: true, deletedAt: true },
		});
	}

	async findListState(resource: PermissionResource): Promise<ResourceState | null> {
		const list = { select: { status: true, deletedAt: true } } as const;
		if (resource.cardId) {
			const card = await this.client.cards.findUnique({
				where: { id: resource.cardId },
				select: { list },
			});
			return card?.list ?? null;
		}
		if (resource.checklistItemId) {
			const item = await this.client.checklistItems.findUnique({
				where: { id: resource.checklistItemId },
				select: { checklist: { select: { card: { select: { list } } } } },
			});
			return item?.checklist.card.list ?? null;
		}
		if (resource.checklistId) {
			const checklist = await this.client.checklists.findUnique({
				where: { id: resource.checklistId },
				select: { card: { select: { list } } },
			});
			return checklist?.card.list ?? null;
		}
		if (resource.commentId) {
			const comment = await this.client.cardComments.findUnique({
				where: { id: resource.commentId },
				select: { card: { select: { list } } },
			});
			return comment?.card.list ?? null;
		}
		return resource.listId
			? this.client.lists.findUnique({ where: { id: resource.listId }, ...list })
			: null;
	}

	async findCardState(resource: PermissionResource): Promise<ResourceState | null> {
		const card = { select: { status: true, deletedAt: true } } as const;
		if (resource.cardId)
			return this.client.cards.findUnique({
				where: { id: resource.cardId },
				...card,
			});
		if (resource.checklistItemId) {
			const item = await this.client.checklistItems.findUnique({
				where: { id: resource.checklistItemId },
				select: { checklist: { select: { card } } },
			});
			return item?.checklist.card ?? null;
		}
		if (resource.checklistId) {
			const checklist = await this.client.checklists.findUnique({
				where: { id: resource.checklistId },
				select: { card },
			});
			return checklist?.card ?? null;
		}
		if (resource.commentId) {
			const comment = await this.client.cardComments.findUnique({
				where: { id: resource.commentId },
				select: { card },
			});
			return comment?.card ?? null;
		}
		return null;
	}

	findBoardState(
		boardId: string,
	): Promise<(ResourceState & { project: ResourceState }) | null> {
		return this.client.boards.findUnique({
			where: { id: boardId },
			select: {
				status: true,
				deletedAt: true,
				project: { select: { status: true, deletedAt: true } },
			},
		});
	}

	private async listRoles(where: Prisma.rolesWhereInput): Promise<PermissionRole[]> {
		const roles = await this.client.roles.findMany({
			where: { ...where, status: RoleStatusEnum.ACTIVE, deletedAt: null },
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
		return roles.map((role) => ({
			name: role.name,
			permissions: role.rolesPermissions.map((grant) => grant.permission.name),
		}));
	}

	listSystemRoles(userId: string): Promise<PermissionRole[]> {
		return this.listRoles({ usersRoles: { some: { userId } } });
	}

	listProjectRoles(userId: string, projectId: string): Promise<PermissionRole[]> {
		return this.listRoles({ projectMembers: { some: { userId, projectId } } });
	}

	listBoardRoles(userId: string, boardId: string): Promise<PermissionRole[]> {
		return this.listRoles({ boardMembers: { some: { userId, boardId } } });
	}

	async findProjectId(projectId: string): Promise<string | null> {
		const project = await this.client.projects.findUnique({
			where: { id: projectId },
			select: { id: true },
		});
		return project?.id ?? null;
	}

	async findBoardProjectId(boardId: string): Promise<string | null> {
		const board = await this.client.boards.findUnique({
			where: { id: boardId },
			select: { projectId: true },
		});
		return board?.projectId ?? null;
	}

	async findBoardId(resource: PermissionResource): Promise<string | null> {
		if (resource.checklistItemId) {
			const item = await this.client.checklistItems.findUnique({
				where: { id: resource.checklistItemId },
				select: {
					checklist: {
						select: {
							card: { select: { list: { select: { boardId: true } } } },
						},
					},
				},
			});
			return item?.checklist.card.list.boardId ?? null;
		}
		if (resource.checklistId) {
			const checklist = await this.client.checklists.findUnique({
				where: { id: resource.checklistId },
				select: { card: { select: { list: { select: { boardId: true } } } } },
			});
			return checklist?.card.list.boardId ?? null;
		}
		if (resource.commentId) {
			const comment = await this.client.cardComments.findUnique({
				where: { id: resource.commentId },
				select: { card: { select: { list: { select: { boardId: true } } } } },
			});
			return comment?.card.list.boardId ?? null;
		}
		if (resource.labelId) {
			const label = await this.client.labels.findUnique({
				where: { id: resource.labelId },
				select: { boardId: true },
			});
			return label?.boardId ?? null;
		}
		if (resource.cardId) {
			const card = await this.client.cards.findUnique({
				where: { id: resource.cardId },
				select: { list: { select: { boardId: true } } },
			});
			return card?.list.boardId ?? null;
		}
		if (resource.listId) {
			const list = await this.client.lists.findUnique({
				where: { id: resource.listId },
				select: { boardId: true },
			});
			return list?.boardId ?? null;
		}
		if (resource.boardId) {
			const board = await this.client.boards.findUnique({
				where: { id: resource.boardId },
				select: { id: true },
			});
			return board?.id ?? null;
		}
		return null;
	}
}
