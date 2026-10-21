import { z } from 'zod';

export const cardAssignmentResponseDtoSchema = z.object({
	id: z.uuid(),
	cardId: z.uuid(),
	userId: z.uuid(),
});
export const cardLabelRelationResponseDtoSchema = z.object({
	id: z.uuid(),
	cardId: z.uuid(),
	labelId: z.uuid(),
});

export const cardResponseDtoSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string().nullable(),
	position: z.number(),
	listId: z.uuid(),
	status: z.enum(['ACTIVE', 'ARCHIVED']),
	isComplete: z.boolean(),
	background: z.string().nullable(),
	dueDate: z.date().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
	deletedAt: z.date().nullable(),
});
