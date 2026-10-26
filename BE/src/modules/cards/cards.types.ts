export type CardStatus = 'ACTIVE' | 'ARCHIVED';
export interface CardUpdateInput {
	title?: string;
	description?: string | null;
	dueDate?: Date | null;
	isComplete?: boolean;
	reminderMinutesBefore?: 60 | 1440 | null;
}
export interface CardUpdateActivityDetails {
	changedFields: (keyof CardUpdateInput)[];
	title?: { from: string; to: string };
	dueDate?: { from: Date | null; to: Date | null };
	isComplete?: { from: boolean; to: boolean };
	reminderMinutesBefore?: { from: number | null; to: number | null };
}
export interface CardAssignment {
	id: string;
	cardId: string;
	userId: string;
}
export interface CardLabelRelation {
	id: string;
	cardId: string;
	labelId: string;
}
export interface CardRecord {
	id: string;
	title: string;
	description: string | null;
	listId: string;
	position: number;
	status: CardStatus;
	isComplete: boolean;
	reminderMinutesBefore: number | null;
	background: string | null;
	dueDate: Date | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}
export interface CardIncludes {
	members?: boolean;
	labels?: boolean;
	checklists?: boolean;
	comments?: boolean;
}
export interface CardMemberView {
	id: string;
	userId: string;
	user: { id: string; name: string; avatar: string | null };
}
export interface CardLabelView {
	id: string;
	label: { id: string; name: string; color: string };
}
export interface ChecklistView {
	id: string;
	title: string;
	checklistItems: { id: string; title: string; completed: boolean }[];
}
export interface CommentView {
	id: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
	user: { id: string; name: string; avatar: string | null };
}
export interface CardQuery
	extends Pick<
		CardRecord,
		| 'id'
		| 'title'
		| 'description'
		| 'dueDate'
		| 'isComplete'
		| 'reminderMinutesBefore'
		| 'position'
		| 'listId'
		| 'createdAt'
	> {
	_count?: {
		cardMembers: number;
		cardLabels: number;
		checklists: number;
		comments: number;
		attachments: number;
	};
	cardMembers?: CardMemberView[];
	cardLabels?: CardLabelView[];
	checklists?: ChecklistView[];
	comments?: CommentView[];
}
export interface CardListEntry extends CardRecord {
	cardMembers: CardMemberView[];
	cardLabels: CardLabelView[];
	checklists: ChecklistView[];
	_count: { comments: number; attachments: number };
}
export interface CardListSummary extends CardListEntry {
	isOverdue: boolean;
}
export interface CardDetails {
	id: string;
	title: string;
	description: string | null;
	dueDate: Date | null;
	isComplete: boolean;
	reminderMinutesBefore: number | null;
	isOverdue: boolean;
	position: number;
	listId: string;
	memberCount: number;
	labelCount: number;
	checklistCount: number;
	commentCount: number;
	attachmentCount: number;
	createdAt: Date;
	_links: { members: string; labels: string; checklists: string; comments: string };
	members?: {
		id: string;
		userId: string;
		userName: string;
		userAvatar: string | null;
	}[];
	labels?: { id: string; name: string; color: string }[];
	checklists?: {
		id: string;
		title: string;
		checklistItems: ChecklistView['checklistItems'];
		itemCount: number;
		completedCount: number;
	}[];
	comments?: {
		id: string;
		content: string;
		createdAt: Date;
		updatedAt: Date;
		userId: string;
		userName: string;
		userAvatar: string | null;
	}[];
}
