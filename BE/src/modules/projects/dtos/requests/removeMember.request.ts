import z from 'zod';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

const removeMemberProjectRequestBody = z.object({
	userId: z.string().uuid(),
});
const removeMemberProjectRequestParams = z.object({
	projectId: z.string().uuid(),
});

export const RemoveMemberProjectRequestValidationSchema: ZodValidationSchema = {
	params: removeMemberProjectRequestParams,
	body: removeMemberProjectRequestBody,
};

export const RemoveMemberProjectRequestSchema = {
	params: removeMemberProjectRequestParams,
	body: {
		description: 'Remove a member from project',
		content: {
			'application/json': {
				schema: removeMemberProjectRequestBody,
			},
		},
	},
};
