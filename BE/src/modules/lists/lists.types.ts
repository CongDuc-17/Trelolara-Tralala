export type ListStatus = 'ACTIVE' | 'ARCHIVED';

export interface ListRecord {
	id: string;
	name: string;
	boardId: string;
	position: number;
	status: ListStatus;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface ListBoardState {
	id: string;
	projectId: string;
	status: string;
	deletedAt: Date | null;
	project: { status: string; deletedAt: Date | null };
}
