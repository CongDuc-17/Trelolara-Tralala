import z from 'zod';
import { ZodValidationSchema } from '@/common';

const updateChecklistItemRequestParams = z
	.object({
		checklistItemId: z
			.string()
			.uuid('Invalid checklist item ID')
			.describe('Checklist item ID'),
	})
	.strict();

const updateChecklistItemRequestBody = z
	.object({
		title: z
			.string()
			.min(1)
			.max(255)
			.optional()
			.describe('Updated checklist item content'),
		completed: z
			.boolean()
			.optional()
			.describe('Updated checklist item completion status'),
	})
	.strict()
	.refine(
		(input) => input.title !== undefined || input.completed !== undefined,
		'No fields to update',
	);

export const updateChecklistItemValidationSchema: ZodValidationSchema = {
	params: updateChecklistItemRequestParams,
	body: updateChecklistItemRequestBody,
};

export const updateChecklistItemRequestSchema = {
	params: updateChecklistItemRequestParams,
	body: {
		description: 'Update the content and completion status of a checklist item',
		content: {
			'application/json': {
				schema: updateChecklistItemRequestBody,
			},
		},
	},
};
