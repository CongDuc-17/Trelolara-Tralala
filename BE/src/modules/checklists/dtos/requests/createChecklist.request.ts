import z from 'zod';

import { ZodValidationSchema } from '@/common';

const createChecklistRequestBody = z
	.object({
		title: z.string().min(1).max(255).describe('Checklist title'),
	})
	.strict();

const createChecklistRequestParams = z
	.object({
		cardId: z.string().uuid('Invalid card ID').describe('Card ID'),
	})
	.strict();

export const createChecklistValidationSchema: ZodValidationSchema = {
	body: createChecklistRequestBody,
	params: createChecklistRequestParams,
};

export const createChecklistRequestSchema = {
	params: createChecklistRequestParams,
	body: {
		description: 'Create a new checklist in a card',
		content: {
			'application/json': {
				schema: createChecklistRequestBody,
			},
		},
	},
};
