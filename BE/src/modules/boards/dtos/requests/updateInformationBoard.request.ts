import z from 'zod';
import { ZodValidationSchema } from '@/common';

const updateInformationBoardRequestBody = z
	.object({
		name: z
			.string()
			.min(2, { message: 'Name must be at least 2 characters long' })
			.max(100)
			.optional(),
		description: z.string().max(500).optional(),
	})
	.strict();

const updateInformationBoardRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

export const UpdateInformationBoardRequestValidationSchema: ZodValidationSchema = {
	params: updateInformationBoardRequestParams,
	body: updateInformationBoardRequestBody,
};

export const UpdateInformationBoardRequestSchema = {
	params: updateInformationBoardRequestParams,
	body: {
		description: 'Update board information',
		content: {
			'application/json': {
				schema: updateInformationBoardRequestBody,
			},
		},
	},
};
