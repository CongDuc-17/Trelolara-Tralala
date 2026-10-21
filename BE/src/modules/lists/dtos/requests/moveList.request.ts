import z from 'zod';

import { ZodValidationSchema } from '@/common';

const moveListRequestBody = z
	.object({
		beforeListId: z.string().uuid().optional(),
		afterListId: z.string().uuid().optional(),
	})
	.strict();

const moveListRequestParams = z
	.object({
		listId: z.string().uuid('Invalid list ID ').describe('List ID'),
	})
	.strict();

export const moveListRequestValidationSchema: ZodValidationSchema = {
	body: moveListRequestBody,
	params: moveListRequestParams,
};

export const moveListRequestSchema = {
	params: moveListRequestParams,
	body: {
		description: 'Move a list to a new position',
		content: {
			'application/json': {
				schema: moveListRequestBody,
			},
		},
	},
};
