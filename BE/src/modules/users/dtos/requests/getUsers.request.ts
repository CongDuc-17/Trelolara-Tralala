import { UserStatusEnum } from '@prisma/client';
import z from 'zod';

import { PaginationSchema } from '@/common/dtos/pagination.dto';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

export class GetUsersRequestDto {
	name?: string;
	status?: UserStatusEnum;

	constructor(data?: Partial<GetUsersRequestDto>) {
		this.name = data?.name;
		this.status = data?.status;
	}
}

const getUsersRequestQuery = z
	.object({
		name: z.string().optional(),
		status: z.enum(UserStatusEnum).optional(),
	})
	.extend(PaginationSchema)
	.strict();

export const getUsersRequestValidationSchema: ZodValidationSchema = {
	query: getUsersRequestQuery,
};

export const getUsersRequestSchema = {
	query: getUsersRequestQuery,
};
