import { prisma, type DatabaseClient } from '../database';
import type { ChecklistItemRecord } from '../checklists/checklists.types';

export interface UpdateChecklistItemInput {
	title?: string;
	completed?: boolean;
}
export class ChecklistItemsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	createChecklistItem(
		checklistId: string,
		title: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistItemRecord> {
		return client.checklistItems.create({ data: { checklistId, title } });
	}
	getChecklistItemById(
		id: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistItemRecord | null> {
		return client.checklistItems.findUnique({ where: { id } });
	}
	updateChecklistItem(
		id: string,
		input: UpdateChecklistItemInput,
		client: DatabaseClient = this.client,
	): Promise<ChecklistItemRecord> {
		return client.checklistItems.update({ where: { id }, data: input });
	}
	deleteChecklistItemById(
		id: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistItemRecord> {
		return client.checklistItems.delete({ where: { id } });
	}
}
