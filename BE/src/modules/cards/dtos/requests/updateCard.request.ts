import { z } from 'zod';
import type { ZodValidationSchema } from '@/common';

export const updateCardRequestBody = z
	.strictObject({
		title: z
			.string()
			.min(1)
			.max(100)
			.refine((title) => title.trim().length > 0, 'Title cannot be blank')
			.optional(),
		description: z.string().nullable().optional(),
		dueDate: z.iso
			.datetime({ offset: true })
			.refine((value) => Number.isFinite(Date.parse(value)), 'Invalid due date')
			.transform((value) => new Date(value))
			.nullable()
			.optional()
			.describe('ISO 8601 with Z or an explicit offset; null clears the deadline'),
		isComplete: z.boolean().optional(),
		reminderMinutesBefore: z
			.union([z.literal(60), z.literal(1440)])
			.nullable()
			.optional()
			.describe(
				'null disables reminders; 60 or 1440 minutes before dueDate. Requires a deadline when enabled.',
			),
	})
	.refine(
		(input) => Object.values(input).some((value) => value !== undefined),
		'Provide at least one card field',
	);

const params = z.strictObject({ cardId: z.uuid() });
export const updateCardRequestValidationSchema: ZodValidationSchema = {
	params,
	body: updateCardRequestBody,
};
export const updateCardRequestSchema = {
	params,
	body: {
		required: true,
		description:
			'Update card details. Omitted fields are unchanged; null clears description or dueDate. Completion is independent of deadline and lifecycle.',
		content: { 'application/json': { schema: updateCardRequestBody } },
	},
};
