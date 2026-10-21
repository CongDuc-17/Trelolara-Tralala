export type CardStatus = 'ACTIVE' | 'ARCHIVED';
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
		'id' | 'title' | 'description' | 'dueDate' | 'position' | 'listId' | 'createdAt'
	> {
	_count?: {
		cardMembers: number;
		cardLabels: number;
		checklists: number;
		comments: number;
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
	_count: { comments: number };
}
export interface CardDetails {
	id: string;
	title: string;
	description: string | null;
	dueDate: Date | null;
	position: number;
	listId: string;
	memberCount: number;
	labelCount: number;
	checklistCount: number;
	commentCount: number;
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
