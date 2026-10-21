import z from 'zod';
import { ZodValidationSchema } from '@/common';

const updateLabelRequestBody = z
	.object({
		name: z.string().min(1).max(50).optional(),
		color: z.string().min(1).max(20).optional(),
	})
	.strict()
	.refine(
		(input) => input.name !== undefined || input.color !== undefined,
		'No fields to update',
	);

export const updateLabelRequestParams = z
	.object({
		labelId: z.string().uuid('Invalid label ID').describe('Label ID'),
	})
	.strict();

export const updateLabelRequestValidationSchema: ZodValidationSchema = {
	body: updateLabelRequestBody,
	params: updateLabelRequestParams,
};

export const updateLabelRequestSchema = {
	params: updateLabelRequestParams,
	body: {
		description: 'Update an existing label',
		content: {
			'application/json': {
				schema: updateLabelRequestBody,
			},
		},
	},
};
