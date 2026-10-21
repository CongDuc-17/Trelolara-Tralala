export interface CommentRecord {
	id: string;
	cardId: string;
	userId: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
	user: { id: string; name: string; email: string; avatar: string | null };
}
