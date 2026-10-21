import { z } from 'zod';

import { PaginationSchema } from '@/common/dtos/pagination.dto';

export const getNotificationsQuerySchema = z.object({
	...PaginationSchema,
	isRead: z
		.enum(['true', 'false'])
		.transform((value) => value === 'true')
		.optional(),
});

export const getNotificationsRequestSchema = { query: getNotificationsQuerySchema };
