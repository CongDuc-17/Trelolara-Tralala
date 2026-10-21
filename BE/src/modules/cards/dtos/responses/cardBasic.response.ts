import { z } from 'zod';
export const cardBasicResponseDtoSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().nullable(),
	dueDate: z.date().nullable(),
	position: z.number(),
	listId: z.uuid(),
	memberCount: z.number(),
	labelCount: z.number(),
	checklistCount: z.number(),
	commentCount: z.number(),
	_links: z.object({
		members: z.string(),
		labels: z.string(),
		checklists: z.string(),
		comments: z.string(),
	}),
	createdAt: z.date(),
});
