export interface ChecklistItemRecord {
	id: string;
	checklistId: string;
	title: string;
	completed: boolean;
	createdAt: Date;
}
export interface ChecklistRecord {
	id: string;
	cardId: string;
	title: string;
	createdAt: Date;
	checklistItems?: ChecklistItemRecord[];
}
