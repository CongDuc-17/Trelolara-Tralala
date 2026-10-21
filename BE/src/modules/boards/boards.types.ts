export type BoardStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

export interface BoardRecord {
	id: string;
	projectId: string;
	name: string;
	description: string | null;
	background: string | null;
	status: BoardStatus;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
	_count: { lists: number; boardMembers: number };
}

export interface BoardInput {
	name: string;
	description?: string;
}

export interface BoardSummary {
	id: string;
	projectId: string;
	name: string;
	description?: string;
	background?: string;
	status: BoardStatus;
	membersCount: number;
	listsCount: number;
}

export interface UserBoard extends BoardSummary {
	projectName: string;
	projectStatus: string;
	roleId: string;
	roleName: string;
}

export interface BoardDetails extends Omit<BoardSummary, 'membersCount' | 'listsCount'> {
	roleId: string;
	roleName: string;
	memberCount: number;
	listCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface BoardUpdate {
	id: string;
	projectId: string;
	name: string;
	description?: string;
	background?: string;
}

export interface BoardMember {
	boardId: string;
	userId: string;
	name: string;
	email: string;
	avatar: string;
	roleId: string;
	roleName: string;
}

export interface BoardsPage<T> {
	items: T[];
	totalItems: number;
	page: number;
	limit: number;
}

export interface BackgroundStorage {
	upload(
		buffer: Buffer,
		mimetype: string,
		folder: string,
	): Promise<{ public_id: string; secure_url: string }>;
	delete(publicId: string): Promise<void>;
	extractPublicId(url: string): string | null;
}
