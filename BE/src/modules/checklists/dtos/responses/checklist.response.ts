import { checklistItems } from '@prisma/client';
import z from 'zod';
export class ChecklistResponseDto {
	id: string;
	title: string;
	cardId: string;
	checklistItems?: checklistItems[];

	constructor(checklist: {
		id: string;
		title: string;
		cardId: string;
		checklistItems?: checklistItems[];
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
	checklistItems: z.array(z.any()).optional(),
});
