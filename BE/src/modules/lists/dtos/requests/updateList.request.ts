import z from 'zod';
import { ZodValidationSchema } from '@/common';

const updateListRequestBody = z
	.object({
		name: z.string().min(1).max(100),
	})
	.strict();

export const updateListRequestParams = z
	.object({
		listId: z.string().uuid('Invalid list ID'),
	})
	.strict();

export const updateListRequestValidationSchema: ZodValidationSchema = {
	params: updateListRequestParams,
	body: updateListRequestBody,
};

export const updateListRequestSchema = {
	params: updateListRequestParams,
	body: {
		description: 'Update list details',
		content: {
			'application/json': {
				schema: updateListRequestBody,
			},
		},
	},
};
