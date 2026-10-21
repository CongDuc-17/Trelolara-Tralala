import { NotFoundException, OptionalException } from '@/common/exceptions';
import { ChecklistsService } from '../checklists/checklists.service';
import type {
	ChecklistItemRecord,
	ChecklistRecord,
} from '../checklists/checklists.types';
import { recordCardActivity } from '../cardActivities/card-activity';
import type { CardActivityMetadata } from '../cardActivities/cardActivities.types';
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
		actorId: string,
	): Promise<ChecklistItemRecord> {
		return this.checklists.withChecklist(checklistId, async (checklist, client) => {
			const item = await this.repository.createChecklistItem(
				checklistId,
				title,
				client,
			);
			await recordCardActivity(client, {
				cardId: checklist.cardId,
				userId: actorId,
				action: 'checklist_item_created',
				metadata: { checklistId, itemId: item.id },
			});
			return item;
		});
	}
	async updateChecklistItem(
		id: string,
		actorId: string,
		title?: string,
		completed?: boolean,
	): Promise<ChecklistItemRecord> {
		if (title === undefined && completed === undefined)
			throw new OptionalException(422, 'No fields to update');
		return this.withItem(id, async (item, checklist, client) => {
			const changes: { title?: string; completed?: boolean } = {};
			const metadata: CardActivityMetadata['checklist_item_updated'] = {
				checklistId: checklist.id,
				itemId: id,
				changedFields: [],
			};
			if (title !== undefined && title !== item.title) {
				changes.title = title;
				metadata.changedFields.push('title');
			}
			if (completed !== undefined && completed !== item.completed) {
				changes.completed = completed;
				metadata.changedFields.push('completed');
				metadata.completed = { from: item.completed, to: completed };
			}
			if (!metadata.changedFields.length) return item;
			const updated = await this.repository.updateChecklistItem(
				id,
				changes,
				client,
			);
			await recordCardActivity(client, {
				cardId: checklist.cardId,
				userId: actorId,
				action: 'checklist_item_updated',
				metadata,
			});
			return updated;
		});
	}
	async deleteChecklistItem(id: string, actorId: string): Promise<void> {
		await this.withItem(
			id,
			async (item, checklist, client) => {
				await this.repository.deleteChecklistItemById(id, client);
				await recordCardActivity(client, {
					cardId: checklist.cardId,
					userId: actorId,
					action: 'checklist_item_deleted',
					metadata: { checklistId: checklist.id, itemId: item.id },
				});
			},
			false,
		);
	}
	private async withItem<T>(
		id: string,
		work: (
			item: ChecklistItemRecord,
			checklist: ChecklistRecord,
			client: DatabaseClient,
		) => Promise<T>,
		active = true,
	): Promise<T> {
		const initial = await this.repository.getChecklistItemById(id);
		if (!initial) throw new NotFoundException('Checklist item not found');
		return this.checklists.withChecklist(
			initial.checklistId,
			async (checklist, client) => {
				const item = await this.repository.getChecklistItemById(id, client);
				if (!item) throw new NotFoundException('Checklist item not found');
				return work(item, checklist, client);
			},
			active,
		);
	}
}
