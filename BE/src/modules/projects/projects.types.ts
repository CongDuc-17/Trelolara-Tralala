export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

export interface ProjectInput {
	name: string;
	description?: string;
}

export interface ProjectDetails {
	id: string;
	name: string;
	description?: string;
	status: ProjectStatus;
	createdAt: Date;
	updatedAt: Date;
	membersCount?: number;
	boardsCount?: number;
}

export interface ProjectSummary {
	id: string;
	name: string;
	description?: string;
	status: ProjectStatus;
	roleId: string;
	roleName: string;
	membersCount: number;
	boardsCount: number;
}

export interface ProjectMemberSummary {
	projectId: string;
	id: string;
	name: string;
	email: string;
	avatar: string | null;
	acceptedAt: Date | null;
	invitedAt: Date;
	roleId: string;
	roleName: string;
}

export interface ProjectPage<T> {
	items: T[];
	totalItems: number;
	page: number;
	limit: number;
}

export interface ProjectPagination {
	page: number;
	limit: number;
}
