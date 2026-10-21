import z from 'zod';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

const updateRoleMemberProjectRequestBody = z.object({
	userId: z.string().uuid(),
	roleId: z.string().uuid(),
});

const updateRoleMemberProjectRequestParams = z.object({
	projectId: z.string().uuid(),
});

export const UpdateRoleMemberProjectRequestValidationSchema: ZodValidationSchema = {
	params: updateRoleMemberProjectRequestParams,
	body: updateRoleMemberProjectRequestBody,
};

export const UpdateRoleMemberProjectRequestSchema = {
	params: updateRoleMemberProjectRequestParams,
	body: {
		description: 'Update role of a member in project',
		content: {
			'application/json': {
				schema: updateRoleMemberProjectRequestBody,
			},
		},
	},
};
