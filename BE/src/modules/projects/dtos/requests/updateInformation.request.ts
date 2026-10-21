import z from 'zod';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

const updateInformationRequestBody = z
	.object({
		name: z
			.string()
			.min(2, { message: 'Name must be at least 2 characters long' })
			.max(100)
			.optional(),
		description: z.string().max(500).optional(),
	})
	.strict();

const updateInformationRequestParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

export const UpdateInformationRequestValidationSchema: ZodValidationSchema = {
	params: updateInformationRequestParams,
	body: updateInformationRequestBody,
};

export const UpdateInformationRequestSchema = {
	params: updateInformationRequestParams,
	body: {
		description: 'Update project information',
		content: {
			'application/json': {
				schema: updateInformationRequestBody,
			},
		},
	},
};
