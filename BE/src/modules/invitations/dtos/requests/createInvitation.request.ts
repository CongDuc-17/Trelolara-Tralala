import { ZodValidationSchema } from '@/common';
import { z } from 'zod';

export const CreateInvitationBodyRequestSchema = z.object({
	email: z.string().email(),
	roleId: z.uuid().optional(),
});
const getProjectByIdRequestParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

const getBoardByIdRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

export const CreateInvitationRequestValidationSchemaProject: ZodValidationSchema = {
	params: getProjectByIdRequestParams,
	body: CreateInvitationBodyRequestSchema,
};

export const CreateInvitationRequestValidationSchemaBoard: ZodValidationSchema = {
	params: getBoardByIdRequestParams,
	body: CreateInvitationBodyRequestSchema,
};

export const CreateInvitationRequestSchema = (type: 'project' | 'board') => ({
	params: type === 'project' ? getProjectByIdRequestParams : getBoardByIdRequestParams,
	body: {
		description: 'Create Invitation Body',
		content: {
			'application/json': {
				schema: CreateInvitationBodyRequestSchema,
			},
		},
	},
});
