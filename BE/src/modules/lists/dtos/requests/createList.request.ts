import z from 'zod';

import { ZodValidationSchema } from '@/common';

const createListRequestBody = z
	.object({
		name: z.string().min(1).max(100),
	})
	.strict();

const createListRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

export const createListRequestValidationSchema: ZodValidationSchema = {
	params: createListRequestParams,
	body: createListRequestBody,
};

export const createListRequestSchema = {
	params: createListRequestParams,
	body: {
		description: 'Create a new list in a board',
		content: {
			'application/json': {
				schema: createListRequestBody,
			},
		},
	},
};
