import { CardSearchRepository } from './card-search.repository';
import type { CardSearchInput } from './card-search.schema';
import { isCardOverdue } from './card.mapper';

export class CardSearchService {
	constructor(
		private readonly repository = new CardSearchRepository(),
		private readonly clock = () => new Date(),
	) {}
	async search(actorId: string, input: CardSearchInput, boardId?: string) {
		const now = this.clock();
		const page = await this.repository.search(
			actorId,
			boardId ? input : { ...input, status: 'ACTIVE' },
			boardId,
			now,
		);
		return {
			...page,
			items: page.items.map((card) => ({
				...card,
				isOverdue: isCardOverdue(card, now.getTime()),
			})),
		};
	}
}
