import z from 'zod';
import { ZodValidationSchema } from '@/common';
import { CardStatusEnum } from '@prisma/client';

export const getCardRequestParams = z.object({
	cardId: z.string().uuid('Invalid card ID'),
});

export const getCardRequestParamsSchema = {
	params: getCardRequestParams,
};

const getCardRequestQuery = z.object({
	include: z
		.string()
		.optional()
		.describe('Comma-separated: members,labels,checklists,comments'),
});

export const cardRequestQuery = z.object({
	status: z.enum(CardStatusEnum).optional(),
});

export const getCardRequestValidationSchema: ZodValidationSchema = {
	params: getCardRequestParams,
	query: getCardRequestQuery,
};

export const getCardRequestSchema = {
	params: getCardRequestParams,
	query: getCardRequestQuery,
};
