import { CardsRepository } from '@/modules/cards/card.repository';
import { CardsService } from '@/modules/cards/card.service';
import { mapCard } from '@/modules/cards/card.mapper';
import { cardWithIncludesResponseDtoSchema } from '@/modules/cards/dtos';
import type { CardQuery } from '@/modules/cards/cards.types';
import type { DatabaseClient } from '@/modules/database';

const id = '0a5fb79a-8eb3-4f1b-8615-85fdb47b3878';
const date = new Date('2026-10-21T00:00:00Z');
const row: CardQuery = {
	id,
	title: 'Card',
	description: null,
	dueDate: null,
	isComplete: false,
	reminderMinutesBefore: null,
	listId: id,
	position: 1,
	createdAt: date,
	_count: { cardMembers: 1, cardLabels: 1, checklists: 1, comments: 1 },
	cardMembers: [{ id, userId: id, user: { id, name: 'Author', avatar: null } }],
	cardLabels: [{ id: 'relation-id', label: { id, name: 'Ready', color: 'red' } }],
	checklists: [
		{
			id,
			title: 'Tasks',
			checklistItems: [
				{ id, title: 'Done', completed: true },
				{ id, title: 'Open', completed: false },
			],
		},
	],
	comments: [
		{
			id,
			content: 'Hello',
			createdAt: date,
			updatedAt: date,
			user: { id, name: 'Author', avatar: null },
		},
	],
};

describe('Card query projections and FE shape', () => {
	it('keeps the basic response fields and omits unrequested relations from JSON', () => {
		const data = JSON.parse(JSON.stringify(mapCard(row)));
		expect(Object.keys(data).sort()).toEqual(
			[
				'id',
				'title',
				'description',
				'dueDate',
				'isComplete',
				'reminderMinutesBefore',
				'isOverdue',
				'listId',
				'position',
				'createdAt',
				'memberCount',
				'labelCount',
				'checklistCount',
				'commentCount',
				'_links',
			].sort(),
		);
		expect(data).toMatchObject({
			description: null,
			dueDate: null,
			isComplete: false,
			isOverdue: false,
			memberCount: 1,
			commentCount: 1,
			_links: { comments: `/cards/${id}/comments` },
		});
	});
	it('maps includes to their existing names, retains false and null, and uses label IDs', () => {
		const data = mapCard(row, {
			members: true,
			labels: true,
			checklists: true,
			comments: true,
		});
		expect(cardWithIncludesResponseDtoSchema.parse(data)).toEqual(data);
		expect(data.members?.[0]).toEqual({
			id,
			userId: id,
			userName: 'Author',
			userAvatar: null,
		});
		expect(data.labels?.[0].id).toBe(id);
		expect(data.checklists?.[0]).toMatchObject({
			itemCount: 2,
			completedCount: 1,
			checklistItems: [{ completed: true }, { completed: false }],
		});
		expect(data.comments?.[0]).toMatchObject({
			userId: id,
			userName: 'Author',
			userAvatar: null,
		});
		expect(
			JSON.parse(JSON.stringify(mapCard(row, { members: true }))),
		).not.toHaveProperty('comments');
	});
	it('always selects counts and only the requested relations and public user fields', async () => {
		const findUnique = jest.fn().mockResolvedValue(row);
		const repository = new CardsRepository({
			cards: { findUnique },
		} as unknown as DatabaseClient);
		await repository.getCardWithIncludes(id, { members: true, comments: true });
		const query = findUnique.mock.calls[0][0];
		expect(query.select._count.select).toEqual({
			cardMembers: true,
			cardLabels: true,
			checklists: true,
			comments: true,
		});
		expect(query.select.cardMembers.select.user.select).toEqual({
			id: true,
			name: true,
			avatar: true,
		});
		expect(query.select.comments.select.user.select).toEqual({
			id: true,
			name: true,
			avatar: true,
		});
		expect(query.select.cardLabels).toBe(false);
		expect(query.select.isComplete).toBe(true);
		expect(query.select.checklists).toBe(false);
		await repository.getCardWithCounts(id);
		expect(findUnique.mock.calls[1][0].select).not.toHaveProperty('cardMembers');
		expect(findUnique.mock.calls[1][0].select.isComplete).toBe(true);
	});
	it('returns plain data and a controlled missing-card error', async () => {
		const repository = {
			getCardWithCounts: jest
				.fn()
				.mockResolvedValueOnce(row)
				.mockResolvedValueOnce(null),
			getCardWithIncludes: jest.fn().mockResolvedValue(row),
		};
		const service = new CardsService(repository as unknown as CardsRepository);
		await expect(service.getCardById(id)).resolves.toEqual(mapCard(row));
		await expect(service.getCardById('missing')).rejects.toMatchObject({
			status: 404,
		});
		await expect(service.getCardById(id, { labels: true })).resolves.toMatchObject({
			labels: [{ id }],
		});
	});
	it('locks captured ancestry even if the old list disappears after a concurrent move', async () => {
		const findUnique = jest.fn().mockResolvedValue({
			listId: 'old-list',
			list: { boardId: 'board', board: { projectId: 'project' } },
		});
		const queryRaw = jest.fn().mockResolvedValue([]);
		const repository = new CardsRepository({
			cards: { findUnique },
			$queryRaw: queryRaw,
		} as unknown as DatabaseClient);
		await repository.lockCard('card');
		expect(
			queryRaw.mock.calls.map(([parts, value]) => [
				parts.join('?').match(/FROM "(\w+)"/)![1],
				value,
			]),
		).toEqual([
			['Projects', 'project'],
			['Boards', 'board'],
			['Lists', 'old-list'],
			['Cards', 'card'],
		]);
		expect(
			findUnique.mock.calls[0][0].select.list.select.board.select.projectId,
		).toBe(true);
	});
});
