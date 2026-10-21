import z from 'zod';
import { ZodValidationSchema } from '@/common';
import { GetProjectByIdRequestSchema } from '../../../projects/dtos/requests/getProjectById.request';

export const CreateBoardRequestValidationSchema: ZodValidationSchema = {
	params: GetProjectByIdRequestSchema.params,
	body: z.object({
		name: z
			.string()
			.min(2, { message: 'Name must be at least 2 characters long' })
			.max(100),
		description: z.string().max(500).optional(),
	}),
};

export const CreateBoardRequestSchema = {
	params: GetProjectByIdRequestSchema.params,
	body: {
		description: 'Create a new board in a project',
		content: {
			'application/json': {
				schema: CreateBoardRequestValidationSchema.body!,
			},
		},
	},
};
