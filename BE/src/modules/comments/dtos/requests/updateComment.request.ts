import z from 'zod';
import { ZodValidationSchema } from '@/common';

export class UpdateCommentRequestDto {
	commentId: string;
	content: string;

	constructor(data: { commentId: string; content: string }) {
		this.commentId = data.commentId;
		this.content = data.content;
	}
}

export const getCommentByIdRequestParams = z
	.object({
		commentId: z.string().uuid(),
	})
	.strict();

export const GetCommentByIdSchema = {
	params: getCommentByIdRequestParams,
};
const updateCommentRequestBody = z
	.object({
		content: z.string().min(1).max(1000),
	})
	.strict();
export const UpdateCommentRequestValidationSchema: ZodValidationSchema = {
	params: getCommentByIdRequestParams,
	body: updateCommentRequestBody,
};

export const UpdateCommentRequestSchema = {
	params: getCommentByIdRequestParams,
	body: {
		description: 'Update a comment on a card',
		content: {
			'application/json': {
				schema: updateCommentRequestBody,
			},
		},
	},
};
