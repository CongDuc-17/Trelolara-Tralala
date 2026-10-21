import z from 'zod';

import { PaginationSchema } from '@/common/dtos/pagination.dto';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';
import { ProjectStatusEnum } from '@prisma/client';

const getProjectsRequestQuery = z
	.object({
		status: z.enum(ProjectStatusEnum).optional(),
	})
	.extend(PaginationSchema)
	.strict();

export const getProjectsRequestValidationSchema: ZodValidationSchema = {
	query: getProjectsRequestQuery,
};

export const getProjectsRequestSchema = {
	query: getProjectsRequestQuery,
};
