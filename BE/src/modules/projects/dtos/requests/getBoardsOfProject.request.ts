import z from 'zod';

import { PaginationSchema } from '@/common/dtos/pagination.dto';
import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';
import { BoardStatusEnum } from '@prisma/client';

export class GetBoardsOfProjectRequestDto {
	status?: string;

	constructor(data?: Partial<GetBoardsOfProjectRequestDto>) {
		this.status = data?.status;
	}
}

const getBoardsOfProjectParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

const getBoardsOfProjectQuery = z
	.object({
		status: z.enum(BoardStatusEnum).optional(),
	})
	.extend(PaginationSchema)
	.strict();

export const GetBoardsOfProjectRequestValidationSchema: ZodValidationSchema = {
	params: getBoardsOfProjectParams,
	query: getBoardsOfProjectQuery,
};

export const GetBoardsOfProjectRequestSchema = {
	params: getBoardsOfProjectParams,
	query: getBoardsOfProjectQuery,
};
