import { z } from 'zod';
const user = z.object({ id: z.uuid(), name: z.string(), avatar: z.string().nullable() });
export const cardSearchPageSchema = z.object({
	items: z.array(
		z.object({
			id: z.uuid(),
			title: z.string(),
			description: z.string().nullable(),
			dueDate: z.date().nullable(),
			isComplete: z.boolean(),
			isOverdue: z.boolean(),
			reminderMinutesBefore: z.number().nullable(),
			status: z.enum(['ACTIVE', 'ARCHIVED']),
			position: z.number(),
			listId: z.uuid(),
			createdAt: z.date(),
			list: z.object({
				id: z.uuid(),
				name: z.string(),
				status: z.string(),
				board: z.object({
					id: z.uuid(),
					name: z.string(),
					status: z.string(),
					projectId: z.uuid(),
					project: z.object({ status: z.string() }),
				}),
			}),
			cardMembers: z.array(z.object({ userId: z.uuid(), user })),
			cardLabels: z.array(
				z.object({
					label: z.object({
						id: z.uuid(),
						name: z.string(),
						color: z.string(),
					}),
				}),
			),
		}),
	),
	nextCursor: z.uuid().nullable(),
});
