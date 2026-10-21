import type { CardUpdateActivityDetails } from '../cards/cards.types';

export interface CardActivityMetadata {
	created: { listId: string; position: number };
	updated: CardUpdateActivityDetails;
	moved: {
		from: { listId: string; position: number };
		to: { listId: string; position: number };
	};
	archived: { listId: string };
	restored: { listId: string };
	label_added: { labelId: string };
	label_removed: { labelId: string; reason?: 'label_deleted' };
	label_updated: { labelId: string; changedFields: ('name' | 'color')[] };
	member_added: { userId: string };
	member_removed: { userId: string; reason?: 'board_member_removed' };
	checklist_created: { checklistId: string };
	checklist_updated: { checklistId: string };
	checklist_deleted: { checklistId: string };
	checklist_item_created: { checklistId: string; itemId: string };
	checklist_item_updated: {
		checklistId: string;
		itemId: string;
		changedFields: ('title' | 'completed')[];
		completed?: { from: boolean; to: boolean };
	};
	checklist_item_deleted: { checklistId: string; itemId: string };
	comment_created: { commentId: string };
	comment_updated: { commentId: string };
	attachment_added: {
		attachmentId: string;
		fileName: string;
		fileSize: number;
		mimeType: string | null;
	};
	attachment_deleted: CardActivityMetadata['attachment_added'];
}
export type CardActivityAction = keyof CardActivityMetadata;
export type CardActivityEvent = { cardId: string; userId: string } & {
	[A in CardActivityAction]: { action: A; metadata: CardActivityMetadata[A] };
}[CardActivityAction];
export type ActivityJson =
	| string
	| number
	| boolean
	| null
	| ActivityJson[]
	| { [key: string]: ActivityJson | undefined };
export interface CardActivityRecord {
	id: string;
	cardId: string;
	userId: string;
	action: string;
	details: string | null;
	metadata: ActivityJson;
	createdAt: Date;
	user: { id: string; name: string; avatar: string | null };
}
export interface CardActivityQuery {
	cursor?: string;
	limit: number;
}
export interface CardActivityPage {
	items: (Omit<CardActivityRecord, 'user'> & { actor: CardActivityRecord['user'] })[];
	nextCursor: string | null;
}
