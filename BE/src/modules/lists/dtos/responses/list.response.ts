import z from 'zod';

export const listResponseDtoSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	position: z.number(),
	boardId: z.string().uuid(),
	createdAt: z.date(),
	updatedAt: z.date(),
	deletedAt: z.date().nullable(),
	status: z.enum(['ACTIVE', 'ARCHIVED']),
});
