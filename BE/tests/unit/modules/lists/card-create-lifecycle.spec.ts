import 'reflect-metadata';

import { CardsRepository } from '@/modules/cards/card.repository';
import { CardsService } from '@/modules/cards/card.service';
import { CardsController } from '@/modules/cards/card.controller';
import { Exception } from '@/common/exceptions/app-error';
import type { DatabaseClient } from '@/modules/database';
import type { ListsRepository } from '@/modules/lists/list.repository';
import type { Request } from 'express';

describe('card creation through a list', () => {
	function setup() {
		const list = {
			id: 'list',
			boardId: 'board',
			status: 'ACTIVE',
			deletedAt: null as Date | null,
		};
		const board = {
			id: 'board',
			projectId: 'project',
			status: 'ACTIVE',
			deletedAt: null as Date | null,
			project: { status: 'ACTIVE', deletedAt: null as Date | null },
		};
		const card = { id: 'card', listId: list.id, title: 'Task', position: 4 };
		const baseClient = {
			cards: { findFirst: jest.fn(), create: jest.fn() },
		};
		const client = {
			cards: {
				findFirst: jest.fn().mockResolvedValue({ position: 3 }),
				create: jest.fn().mockResolvedValue(card),
			},
		};
		const repository = {
			inTransaction: jest.fn(),
			lockList: jest.fn().mockResolvedValue(undefined),
			getListById: jest.fn().mockImplementation(async () => list),
			getBoardState: jest.fn().mockImplementation(async () => board),
		};
		repository.inTransaction.mockImplementation((work) => work(repository, client));
		const service = new CardsService(
			new CardsRepository(baseClient as unknown as DatabaseClient),
			repository as unknown as ListsRepository,
		);
		return { service, repository, client, baseClient, card, list, board };
	}

	it('locks and rereads the list before using one transaction client for tail read and create', async () => {
		const { service, repository, client, baseClient, card } = setup();
		await expect(service.createCard('Task', 'list', 'actor')).resolves.toEqual({
			success: true,
			data: card,
		});
		expect(repository.lockList).toHaveBeenCalledWith('list');
		expect(repository.getListById.mock.invocationCallOrder[0]).toBeGreaterThan(
			repository.lockList.mock.invocationCallOrder[0],
		);
		expect(client.cards.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ listId: 'list' }),
			}),
		);
		expect(client.cards.create).toHaveBeenCalledWith({
			data: { title: 'Task', listId: 'list', position: 4 },
		});
		expect(baseClient.cards.findFirst).not.toHaveBeenCalled();
		expect(baseClient.cards.create).not.toHaveBeenCalled();
	});

	it.each(['list', 'board', 'project'] as const)(
		'blocks creation under an archived %s',
		async (target) => {
			const { service, client, list, board } = setup();
			const resource =
				target === 'list' ? list : target === 'board' ? board : board.project;
			resource.status = 'ARCHIVED';
			await expect(
				service.createCard('Task', 'list', 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(client.cards.findFirst).not.toHaveBeenCalled();
			expect(client.cards.create).not.toHaveBeenCalled();
		},
	);

	it.each(['list', 'board', 'project'] as const)(
		'blocks creation under a soft-deleted %s',
		async (target) => {
			const { service, client, list, board } = setup();
			const resource =
				target === 'list' ? list : target === 'board' ? board : board.project;
			resource.deletedAt = new Date();
			await expect(
				service.createCard('Task', 'list', 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(client.cards.create).not.toHaveBeenCalled();
		},
	);

	it('returns 404 when the list disappeared before its lock was acquired', async () => {
		const { service, repository, client } = setup();
		repository.getListById.mockResolvedValueOnce(null);
		await expect(service.createCard('Task', 'list', 'actor')).rejects.toMatchObject({
			status: 404,
		});
		expect(client.cards.create).not.toHaveBeenCalled();
	});

	it('returns 404 when the parent board no longer exists', async () => {
		const { service, repository, client } = setup();
		repository.getBoardState.mockResolvedValueOnce(null);
		await expect(service.createCard('Task', 'list', 'actor')).rejects.toMatchObject({
			status: 404,
		});
		expect(client.cards.create).not.toHaveBeenCalled();
	});

	it('rereads state after waiting for a concurrent archive to release the lock', async () => {
		const { service, repository, client, list } = setup();
		let releaseLock!: () => void;
		repository.lockList.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					releaseLock = resolve;
				}),
		);
		const creation = service.createCard('Task', 'list', 'actor');
		expect(repository.getListById).not.toHaveBeenCalled();
		list.status = 'ARCHIVED';
		releaseLock();
		await expect(creation).rejects.toMatchObject({ status: 409 });
		expect(client.cards.create).not.toHaveBeenCalled();
	});

	it('preserves a lock-time conflict for the HTTP error handler', async () => {
		const error = new Exception(409, 'Cannot create a card in an inactive list');
		const service = { createCard: jest.fn().mockRejectedValueOnce(error) };
		const controller = new CardsController(service as unknown as CardsService);
		const request = {
			params: { listId: 'list' },
			body: { title: 'Task' },
			user: { id: 'actor' },
		} as unknown as Request;
		await expect(controller.createCard(request)).rejects.toBe(error);
	});
});

describe('card movement through a list', () => {
	function setup() {
		const source = {
			id: 'source',
			boardId: 'board',
			status: 'ACTIVE',
			deletedAt: null as Date | null,
		};
		const target = { ...source, id: 'target' };
		const repository = {
			getCardById: jest.fn().mockResolvedValue({ id: 'card', listId: source.id }),
			updateCardPosition: jest.fn(),
		};
		const lists = {
			getListById: jest.fn(async (id: string) =>
				id === source.id ? source : target,
			),
		};
		const service = new CardsService(
			repository as unknown as CardsRepository,
			lists as unknown as ListsRepository,
		);
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		return { service, repository, source, target };
	}

	it.each(['source', 'target'] as const)(
		'rejects an archived %s list before writing',
		async (name) => {
			const { service, repository, source, target } = setup();
			(name === 'source' ? source : target).status = 'ARCHIVED';
			await expect(
				service.moveCard('card', 'target', 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(repository.updateCardPosition).not.toHaveBeenCalled();
		},
	);

	it.each(['source', 'target'] as const)(
		'rejects a soft-deleted %s list before writing',
		async (name) => {
			const { service, repository, source, target } = setup();
			(name === 'source' ? source : target).deletedAt = new Date();
			await expect(
				service.moveCard('card', 'target', 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(repository.updateCardPosition).not.toHaveBeenCalled();
		},
	);

	it('preserves a destination lifecycle conflict for the HTTP error handler', async () => {
		const error = new Exception(
			409,
			'Cannot move a card from or to an inactive list',
		);
		const service = {
			getCardById: jest
				.fn()
				.mockResolvedValue({ success: true, data: { id: 'card' } }),
			moveCard: jest.fn().mockRejectedValueOnce(error),
		};
		const controller = new CardsController(service as unknown as CardsService);
		const request = {
			params: { cardId: 'card' },
			body: { targetListId: 'target' },
			user: { id: 'actor' },
		} as unknown as Request;
		await expect(controller.moveCard(request)).rejects.toBe(error);
	});
});
