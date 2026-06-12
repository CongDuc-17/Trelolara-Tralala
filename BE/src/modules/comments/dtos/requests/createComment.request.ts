import z from 'zod';
import { ZodValidationSchema } from '@/common';

export class CreateCommentRequestDto {
	content: string;
	constructor(data: { content: string }) {
		this.content = data.content;
	}
}

const createCommentRequestParams = z.object({
	cardId: z.string().uuid('Invalid card ID format'),
});

const createCommentRequestBody = z.object({
	content: z
		.string()
		.min(1, 'Content cannot be empty')
		.max(1000, 'Content cannot exceed 1000 characters'),
});

export const CreateCommentRequestValidationSchema: ZodValidationSchema = {
	params: createCommentRequestParams,
	body: createCommentRequestBody,
};

export const CreateCommentRequestSchema = {
	params: createCommentRequestParams,
	body: {
		description: 'Create a new comment on a card',
		content: {
			'application/json': {
				schema: createCommentRequestBody,
			},
		},
	},
};
