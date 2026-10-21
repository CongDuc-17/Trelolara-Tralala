import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const ids = z
	.string()
	.max(2000)
	.transform((value) => value.split(','))
	.pipe(z.array(z.uuid()).min(1).max(50))
	.transform((values) => [...new Set(values)]);
export const cardSearchQuery = z.strictObject({
	keyword: z.string().trim().min(1).max(100).optional(),
	memberIds: ids.optional(),
	labelIds: ids.optional(),
	isComplete: z
		.enum(['true', 'false'])
		.transform((value) => value === 'true')
		.optional(),
	status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
	due: z.enum(['overdue', 'soon', 'none']).optional(),
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const myWorkQuery = cardSearchQuery.omit({ status: true });
export type CardSearchInput = z.output<typeof cardSearchQuery>;
