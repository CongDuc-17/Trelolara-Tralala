import { NotFoundException } from '@/common/exceptions';
import { CardsService } from '../cards/card.service';
import { recordCardActivity } from '../cardActivities/card-activity';
import type { DatabaseClient } from '../database';
import { ChecklistsRepository } from './checklists.repository';
import type { ChecklistRecord } from './checklists.types';

export class ChecklistsService {
	constructor(
		private readonly repository = new ChecklistsRepository(),
		private readonly cards = new CardsService(),
	) {}
	createChecklist(
		cardId: string,
		title: string,
		actorId: string,
	): Promise<ChecklistRecord> {
		return this.cards.withLockedCard(cardId, async (_card, _list, client) => {
			const checklist = await this.repository.createChecklist(
				cardId,
				title,
				client,
			);
			await recordCardActivity(client, {
				cardId,
				userId: actorId,
				action: 'checklist_created',
				metadata: { checklistId: checklist.id },
			});
			return checklist;
		});
	}
	async getChecklistById(id: string): Promise<ChecklistRecord> {
		const checklist = await this.repository.getChecklistById(id);
		if (!checklist) throw new NotFoundException('Checklist not found');
		return checklist;
	}
	updateChecklistTitle(
		id: string,
		title: string,
		actorId: string,
	): Promise<ChecklistRecord> {
		return this.withChecklist(id, async (checklist, client) => {
			if (checklist.title === title)
				return {
					id: checklist.id,
					cardId: checklist.cardId,
					title: checklist.title,
					createdAt: checklist.createdAt,
				};
			const updated = await this.repository.updateChecklistTitle(id, title, client);
			await recordCardActivity(client, {
				cardId: checklist.cardId,
				userId: actorId,
				action: 'checklist_updated',
				metadata: { checklistId: id },
			});
			return updated;
		});
	}
	async deleteChecklist(id: string, actorId: string): Promise<void> {
		await this.withChecklist(
			id,
			async (checklist, client) => {
				await this.repository.deleteChecklist(id, client);
				await recordCardActivity(client, {
					cardId: checklist.cardId,
					userId: actorId,
					action: 'checklist_deleted',
					metadata: { checklistId: id },
				});
			},
			false,
		);
	}
	async withChecklist<T>(
		id: string,
		work: (checklist: ChecklistRecord, client: DatabaseClient) => Promise<T>,
		active = true,
	): Promise<T> {
		const initial = await this.getChecklistById(id);
		return this.cards.withLockedCard(
			initial.cardId,
			async (_card, _list, client) => {
				const checklist = await this.repository.getChecklistById(id, client);
				if (!checklist) throw new NotFoundException('Checklist not found');
				return work(checklist, client);
			},
			active,
		);
	}
}
