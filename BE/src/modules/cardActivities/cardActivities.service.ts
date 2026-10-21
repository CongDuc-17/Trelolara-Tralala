import { ForbiddenException } from '@/common/exceptions';
import { CardsService } from '../cards/card.service';
import { CardActivitiesRepository } from './cardActivities.repository';
import type { CardActivityQuery, CardActivityPage } from './cardActivities.types';

export class CardActivitiesService {
	constructor(
		private readonly repository = new CardActivitiesRepository(),
		private readonly cards = new CardsService(),
	) {}
	list(
		cardId: string,
		actorId: string,
		query: CardActivityQuery,
	): Promise<CardActivityPage> {
		return this.cards.withLockedCard(
			cardId,
			async (_card, list, client) => {
				if (!(await this.repository.canRead(actorId, list.boardId, client)))
					throw new ForbiddenException();
				const rows = await this.repository.list(cardId, query, client);
				const items = rows
					.slice(0, query.limit)
					.map(({ user, ...row }) => ({ ...row, actor: user }));
				return {
					items,
					nextCursor:
						rows.length > query.limit ? items[items.length - 1].id : null,
				};
			},
			false,
		);
	}
}
