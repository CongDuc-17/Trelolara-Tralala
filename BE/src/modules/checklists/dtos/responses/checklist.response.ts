import type { ChecklistItemRecord } from '../../checklists.types';
import z from 'zod';
export class ChecklistResponseDto {
	id: string;
	title: string;
	cardId: string;
	checklistItems?: ChecklistItemRecord[];

	constructor(checklist: {
		id: string;
		title: string;
		cardId: string;
		checklistItems?: ChecklistItemRecord[];
	}) {
		this.id = checklist.id;
		this.title = checklist.title;
		this.cardId = checklist.cardId;
		this.checklistItems = checklist.checklistItems;
	}
}

export const checklistResponseDtoSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	cardId: z.string().uuid(),
	checklistItems: z
		.array(
			z.object({
				id: z.uuid(),
				checklistId: z.uuid(),
				title: z.string(),
				completed: z.boolean(),
				createdAt: z.date(),
			}),
		)
		.optional(),
});
