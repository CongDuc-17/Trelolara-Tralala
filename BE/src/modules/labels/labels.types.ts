export interface LabelRecord {
	id: string;
	name: string;
	color: string;
	boardId: string;
	createdAt: Date;
}
export interface LabelUpdate {
	name?: string;
	color?: string;
}
