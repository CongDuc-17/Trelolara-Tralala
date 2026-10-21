import { NotFoundException } from '@/common/exceptions';
import { CardsService } from '../cards/card.service';
import type { DatabaseClient } from '../database';
import { ChecklistsRepository } from './checklists.repository';
import type { ChecklistRecord } from './checklists.types';

export class ChecklistsService {
	constructor(
		private readonly repository = new ChecklistsRepository(),
		private readonly cards = new CardsService(),
	) {}
	createChecklist(cardId: string, title: string): Promise<ChecklistRecord> {
		return this.cards.withLockedCard(cardId, (_card, _list, client) =>
			this.repository.createChecklist(cardId, title, client),
		);
	}
	async getChecklistById(id: string): Promise<ChecklistRecord> {
		const checklist = await this.repository.getChecklistById(id);
		if (!checklist) throw new NotFoundException('Checklist not found');
		return checklist;
	}
	updateChecklistTitle(id: string, title: string): Promise<ChecklistRecord> {
		return this.withChecklist(id, (_checklist, client) =>
			this.repository.updateChecklistTitle(id, title, client),
		);
	}
	async deleteChecklist(id: string): Promise<void> {
		await this.withChecklist(
			id,
			(_checklist, client) => this.repository.deleteChecklist(id, client),
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
