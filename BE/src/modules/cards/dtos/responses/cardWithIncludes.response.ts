import { z } from 'zod';
import { cardBasicResponseDtoSchema } from './cardBasic.response';
export const cardWithIncludesResponseDtoSchema = cardBasicResponseDtoSchema.extend({
	members: z
		.array(
			z.object({
				id: z.uuid(),
				userId: z.uuid(),
				userName: z.string(),
				userAvatar: z.string().nullable(),
			}),
		)
		.optional(),
	labels: z
		.array(z.object({ id: z.uuid(), name: z.string(), color: z.string() }))
		.optional(),
	checklists: z
		.array(
			z.object({
				id: z.uuid(),
				title: z.string(),
				itemCount: z.number(),
				completedCount: z.number(),
				checklistItems: z.array(
					z.object({ id: z.uuid(), title: z.string(), completed: z.boolean() }),
				),
			}),
		)
		.optional(),
	comments: z
		.array(
			z.object({
				id: z.uuid(),
				content: z.string(),
				createdAt: z.date(),
				updatedAt: z.date(),
				userId: z.uuid(),
				userName: z.string(),
				userAvatar: z.string().nullable(),
			}),
		)
		.optional(),
});
