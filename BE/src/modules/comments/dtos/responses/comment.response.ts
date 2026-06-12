import { z } from 'zod';
export class GetCommentResponseDto {
	commentId: string;
	cardId: string;
	user: {
		id: string;
		name: string;
		email: string;
		avatar?: string | null | undefined;
	};
	content: string;
	createdAt: Date;
	updatedAt: Date;
	constructor(data: {
		commentId: string;
		cardId: string;
		user: {
			id: string;
			name: string;
			email: string;
			avatar?: string | null | undefined;
		};
		content: string;
		createdAt: Date;
		updatedAt: Date;
	}) {
		this.commentId = data.commentId;
		this.cardId = data.cardId;
		this.user = data.user;
		this.content = data.content;
		this.createdAt = data.createdAt;
		this.updatedAt = data.updatedAt;
	}
}

export const CommentResponseDTOSchema = z.object({
	commentId: z.string().uuid(),
	cardId: z.string().uuid(),
	user: z.object({
		id: z.string().uuid(),
		name: z.string(),
		email: z.string().email(),
		avatar: z.string().url().nullable().optional(),
	}),
	content: z.string(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
