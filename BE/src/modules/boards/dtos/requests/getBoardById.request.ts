import z from 'zod';
import { ZodValidationSchema } from '@/common';
import { ListStatusEnum } from '@prisma/client';

export class GetBoardByIdRequestDto {
	boardId: string;
	constructor(data: { boardId: string }) {
		this.boardId = data.boardId;
	}
}

const getBoardByIdRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

const getBoardByIdRequestQuery = z
	.object({ status: z.enum(ListStatusEnum).optional() })
	.strict();

export const GetBoardByIdRequestValidationSchema: ZodValidationSchema = {
	params: getBoardByIdRequestParams,
	query: getBoardByIdRequestQuery,
};

export const GetBoardByIdRequestSchema = {
	params: getBoardByIdRequestParams,
	query: getBoardByIdRequestQuery,
};
