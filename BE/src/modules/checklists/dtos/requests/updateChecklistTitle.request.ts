import z from 'zod';

import { ZodValidationSchema } from '@/common';

const updateChecklistTitleRequestBody = z
	.object({
		title: z.string().min(1).max(255).describe('Updated checklist title'),
	})
	.strict();

const updateChecklistTitleRequestParams = z
	.object({
		checklistId: z.string().uuid('Invalid checklist ID').describe('Checklist ID'),
	})
	.strict();

export const updateChecklistTitleValidationSchema: ZodValidationSchema = {
	body: updateChecklistTitleRequestBody,
	params: updateChecklistTitleRequestParams,
};

export const updateChecklistTitleRequestSchema = {
	params: updateChecklistTitleRequestParams,
	body: {
		description: 'Update the title of a checklist',
		content: {
			'application/json': {
				schema: updateChecklistTitleRequestBody,
			},
		},
	},
};
