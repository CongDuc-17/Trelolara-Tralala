import z from 'zod';

import { PaginationSchema } from '@/common/dtos/pagination.dto';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

const getMembersRequestQuery = z.object().extend(PaginationSchema).strict();
const getMembersRequestParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

export const GetMembersRequestValidationSchema: ZodValidationSchema = {
	query: getMembersRequestQuery,
	params: getMembersRequestParams,
};

export const GetMembersRequestSchema = {
	query: getMembersRequestQuery,
	params: getMembersRequestParams,
};
