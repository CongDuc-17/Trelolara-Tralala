import { NotFoundException, OptionalException } from '@/common/exceptions';
import { ChecklistsService } from '../checklists/checklists.service';
import type { ChecklistItemRecord } from '../checklists/checklists.types';
import type { DatabaseClient } from '../database';
import { ChecklistItemsRepository } from './checklistItems.repository';

export class ChecklistItemsService {
	constructor(
		private readonly repository = new ChecklistItemsRepository(),
		private readonly checklists = new ChecklistsService(),
	) {}
	createChecklistItem(
		checklistId: string,
		title: string,
	): Promise<ChecklistItemRecord> {
		return this.checklists.withChecklist(checklistId, (_checklist, client) =>
			this.repository.createChecklistItem(checklistId, title, client),
		);
	}
	async updateChecklistItem(
		id: string,
		title?: string,
		completed?: boolean,
	): Promise<ChecklistItemRecord> {
		if (title === undefined && completed === undefined)
			throw new OptionalException(422, 'No fields to update');
		const changes: { title?: string; completed?: boolean } = {};
		if (title !== undefined) changes.title = title;
		if (completed !== undefined) changes.completed = completed;
		return this.withItem(id, (client) =>
			this.repository.updateChecklistItem(id, changes, client),
		);
	}
	async deleteChecklistItem(id: string): Promise<void> {
		await this.withItem(
			id,
			(client) => this.repository.deleteChecklistItemById(id, client),
			false,
		);
	}
	private async withItem<T>(
		id: string,
		work: (client: DatabaseClient) => Promise<T>,
		active = true,
	): Promise<T> {
		const initial = await this.repository.getChecklistItemById(id);
		if (!initial) throw new NotFoundException('Checklist item not found');
		return this.checklists.withChecklist(
			initial.checklistId,
			async (_checklist, client) => {
				if (!(await this.repository.getChecklistItemById(id, client)))
					throw new NotFoundException('Checklist item not found');
				return work(client);
			},
			active,
		);
	}
}
