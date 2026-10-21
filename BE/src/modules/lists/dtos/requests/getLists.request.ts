import z from 'zod';
import type { ZodValidationSchema } from '@/common';

export const getListsRequestSchema = {
	params: z.object({ boardId: z.string().uuid() }).strict(),
	query: z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }).strict(),
};

export const getListsRequestValidationSchema: ZodValidationSchema = getListsRequestSchema;
