import { CardActivitiesRepository } from '@/modules/cardActivities/cardActivities.repository';
import { CardActivitiesService } from '@/modules/cardActivities/cardActivities.service';
import { recordCardActivity } from '@/modules/cardActivities/card-activity';
import type { CardActivityRecord } from '@/modules/cardActivities/cardActivities.types';
import type { CardsService } from '@/modules/cards/card.service';
import type { DatabaseClient } from '@/modules/database';
import type { ListRecord } from '@/modules/lists/lists.types';
import { cardFixture, makeCard, now } from '../cards/cards.fixture';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const row = (n: number, date = now): CardActivityRecord => ({
	id: id(n),
	cardId: 'card',
	userId: 'actor',
	action: 'updated',
	metadata: { changedFields: ['description'] },
	details: null,
	createdAt: date,
	user: { id: 'actor', name: 'Author', avatar: null },
});
function historyFixture() {
	const rows = [
		row(1),
		row(2),
		row(3, new Date(now.getTime() + 1)),
		{ ...row(4), cardId: 'foreign' },
		{
			...row(0, new Date(now.getTime() - 1)),
			action: 'legacy_custom',
			metadata: null,
			details: 'Old non-JSON details',
		},
	];
	type Where = {
		cardId: string;
		OR?: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }];
	};
	const client = {
		cardActivity: {
			findFirst: jest.fn(
				async ({ where }: { where: { id: string; cardId: string } }) =>
					rows.find(
						(item) => item.id === where.id && item.cardId === where.cardId,
					) ?? null,
			),
			findMany: jest.fn(async ({ where, take }: { where: Where; take: number }) =>
				rows
					.filter(
						(item) =>
							item.cardId === where.cardId &&
							(!where.OR ||
								item.createdAt < where.OR[0].createdAt.lt ||
								(item.createdAt.getTime() ===
									where.OR[1].createdAt.getTime() &&
									item.id < where.OR[1].id.lt)),
					)
					.sort(
						(a, b) =>
							b.createdAt.getTime() - a.createdAt.getTime() ||
							b.id.localeCompare(a.id),
					)
					.slice(0, take),
			),
		},
	};
	const repository = new CardActivitiesRepository();
	jest.spyOn(repository, 'canRead').mockResolvedValue(true);
	const cards = {
		withLockedCard: jest.fn(
			async (
				_cardId: string,
				work: (
					card: ReturnType<typeof makeCard>,
					list: ListRecord,
					client: DatabaseClient,
				) => Promise<unknown>,
			) =>
				work(
					makeCard('card'),
					{ boardId: 'board' } as ListRecord,
					client as unknown as DatabaseClient,
				),
		),
	};
	return {
		rows,
		client,
		repository,
		cards,
		service: new CardActivitiesService(repository, cards as unknown as CardsService),
	};
}

describe('Card activity writer', () => {
	it('writes one typed event in the supplied client and converts dates without losing null/false', async () => {
		const create = jest.fn();
		const client = { cardActivity: { create } } as unknown as DatabaseClient;
		await recordCardActivity(client, {
			cardId: 'card',
			userId: 'actor',
			action: 'updated',
			metadata: {
				changedFields: ['dueDate', 'isComplete'],
				dueDate: { from: now, to: null },
				isComplete: { from: true, to: false },
			},
		});
		expect(create).toHaveBeenCalledWith({
			data: {
				cardId: 'card',
				userId: 'actor',
				action: 'updated',
				metadata: {
					changedFields: ['dueDate', 'isComplete'],
					dueDate: { from: now.toISOString(), to: null },
					isComplete: { from: true, to: false },
				},
			},
		});
		await expect(
			recordCardActivity(client, {
				cardId: 'card',
				userId: '',
				action: 'archived',
				metadata: { listId: 'list' },
			}),
		).rejects.toMatchObject({ status: 422 });
		expect(create).toHaveBeenCalledTimes(1);
	});
	it('propagates a persistence failure to roll back the caller transaction', async () => {
		const failure = new Error('DB error');
		const client = {
			cardActivity: { create: jest.fn().mockRejectedValue(failure) },
		} as unknown as DatabaseClient;
		await expect(
			recordCardActivity(client, {
				cardId: 'card',
				userId: 'actor',
				action: 'comment_created',
				metadata: { commentId: 'comment' },
			}),
		).rejects.toBe(failure);
	});
});
describe('Card activity keyset history', () => {
	it('paginates identical timestamps without duplicates or skipping records and preserves legacy details', async () => {
		const f = historyFixture();
		const first = await f.service.list('card', 'actor', { limit: 2 });
		expect(first.items.map((item) => item.id)).toEqual([id(3), id(2)]);
		expect(first.nextCursor).toBe(id(2));
		f.rows.push(row(5, new Date(now.getTime() + 2)));
		const second = await f.service.list('card', 'actor', {
			limit: 2,
			cursor: first.nextCursor!,
		});
		expect(second.items.map((item) => item.id)).toEqual([id(1), id(0)]);
		expect(second.nextCursor).toBeNull();
		expect(second.items[1]).toMatchObject({
			action: 'legacy_custom',
			details: 'Old non-JSON details',
			metadata: null,
			actor: { id: 'actor', name: 'Author', avatar: null },
		});
		expect(second.items[1]).not.toHaveProperty('user');
		expect(f.client.cardActivity.findMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				take: 3,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				select: expect.objectContaining({
					user: { select: { id: true, name: true, avatar: true } },
				}),
			}),
		);
	});
	it.each([id(4), id(99)])(
		'rejects a foreign or missing cursor %s inside the card scope',
		async (cursor) => {
			const f = historyFixture();
			await expect(
				f.service.list('card', 'actor', { limit: 2, cursor }),
			).rejects.toMatchObject({ status: 422 });
			expect(f.client.cardActivity.findMany).not.toHaveBeenCalled();
		},
	);
	it('returns an empty final page without inventing a next cursor', async () => {
		const f = historyFixture();
		expect(
			await f.service.list('card', 'actor', { limit: 20, cursor: id(0) }),
		).toEqual({ items: [], nextCursor: null });
	});
	it('allows viewer reads under archived ancestors with actual scoped permission checks', async () => {
		const f = cardFixture();
		f.access.role = 'BOARD_VIEWER';
		f.board.status = 'ARCHIVED';
		f.board.project.status = 'ARCHIVED';
		f.state().cards[0].status = 'ARCHIVED';
		const repository = new CardActivitiesRepository();
		const list = jest.spyOn(repository, 'list').mockResolvedValue([row(1)]);
		const service = new CardActivitiesService(repository, f.service);
		await expect(service.list('card', 'actor', { limit: 20 })).resolves.toMatchObject(
			{ items: [{ id: id(1) }], nextCursor: null },
		);
		expect(list).toHaveBeenCalledWith('card', { limit: 20 }, expect.any(Object));
		expect(f.events.slice(0, 4)).toEqual([
			'1:lock:Projects',
			'1:lock:Boards',
			'1:lock:Lists',
			'1:lock:Cards',
		]);
		f.access.allowed = false;
		await expect(service.list('card', 'actor', { limit: 20 })).rejects.toMatchObject({
			status: 403,
		});
		expect(list).toHaveBeenCalledTimes(1);
	});
	it('returns 404 after a card is hard-deleted without querying history', async () => {
		const f = cardFixture([]);
		const repository = new CardActivitiesRepository();
		const list = jest.spyOn(repository, 'list');
		await expect(
			new CardActivitiesService(repository, f.service).list('card', 'actor', {
				limit: 20,
			}),
		).rejects.toMatchObject({ status: 404 });
		expect(list).not.toHaveBeenCalled();
	});
});
