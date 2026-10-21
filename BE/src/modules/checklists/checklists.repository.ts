import { prisma, type DatabaseClient } from '../database';
import type { ChecklistRecord } from './checklists.types';

export class ChecklistsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	createChecklist(
		cardId: string,
		title: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistRecord> {
		return client.checklists.create({ data: { cardId, title } });
	}
	getChecklistById(
		id: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistRecord | null> {
		return client.checklists.findUnique({
			where: { id },
			include: {
				checklistItems: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
			},
		});
	}
	updateChecklistTitle(
		id: string,
		title: string,
		client: DatabaseClient = this.client,
	): Promise<ChecklistRecord> {
		return client.checklists.update({ where: { id }, data: { title } });
	}
	async deleteChecklist(
		id: string,
		client: DatabaseClient = this.client,
	): Promise<void> {
		await client.checklistItems.deleteMany({ where: { checklistId: id } });
		await client.checklists.delete({ where: { id } });
	}
}
