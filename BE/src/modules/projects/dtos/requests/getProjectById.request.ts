import z from 'zod';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

const getProjectByIdRequestParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

export const GetProjectByIdRequestValidationSchema: ZodValidationSchema = {
	params: getProjectByIdRequestParams,
};

export const GetProjectByIdRequestSchema = {
	params: getProjectByIdRequestParams,
};
