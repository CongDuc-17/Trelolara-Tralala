import { NotFoundException, OptionalException } from '@/common/exceptions';
import {
	calculateNewPosition,
	isPositionBetween,
} from '@/common/utils/calculateNewPosition';
import { ListsRepository } from '../lists/list.repository';
import { BoardMembersRepository } from '../boardMembers/boardMember.repository';
import { LabelsRepository } from '../labels/labels.repository';
import { CardMembersRepository } from '../cardMembers/cardMembers.repository';
import { CardLabelsRepository } from '../cardLabels/cardLabels.repository';
import { UsersRepository } from '../users/users.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { DatabaseClient } from '../database';
import type { ListRecord } from '../lists/lists.types';
import { CardsRepository } from './card.repository';
import { mapCard } from './card.mapper';
import type {
	CardAssignment,
	CardDetails,
	CardIncludes,
	CardLabelRelation,
	CardListEntry,
	CardRecord,
	CardStatus,
} from './cards.types';

export class CardsService {
	constructor(
		private readonly cardsRepository = new CardsRepository(),
		private readonly listsRepository = new ListsRepository(),
		private readonly boardMembersRepository = new BoardMembersRepository(),
		private readonly labelsRepository = new LabelsRepository(),
		private readonly cardMembersRepository = new CardMembersRepository(),
		private readonly cardLabelsRepository = new CardLabelsRepository(),
		private readonly usersRepository = new UsersRepository(),
		private readonly notificationsService = new NotificationsService(),
	) {}

	async getAllCardsByListId(
		listId: string,
		_actorId: string,
		status?: CardStatus,
	): Promise<CardListEntry[]> {
		if (!(await this.listsRepository.getListById(listId)))
			throw new NotFoundException('List not found');
		return this.cardsRepository.getAllCardsByListId(listId, status);
	}
	async getCardById(cardId: string, include?: CardIncludes): Promise<CardDetails> {
		const card = include
			? await this.cardsRepository.getCardWithIncludes(cardId, include)
			: await this.cardsRepository.getCardWithCounts(cardId);
		if (!card) throw new NotFoundException('Card not found');
		return mapCard(card, include);
	}

	createCard(title: string, listId: string, _actorId: string): Promise<CardRecord> {
		return this.listsRepository.inTransaction(async (repository, client) => {
			await repository.lockList(listId);
			const list = await repository.getListById(listId);
			if (!list) throw new NotFoundException('List not found');
			await this.requireActiveList(repository, list);
			const siblings = await this.cardsRepository.getActiveCardsByListId(
				listId,
				client,
			);
			const position = await this.allocatePosition(
				siblings,
				siblings.length,
				listId,
				client,
			);
			return this.cardsRepository.createCard(title, listId, position, client);
		});
	}

	async moveCard(
		cardId: string,
		targetListId: string,
		_actorId: string,
		beforeCardId?: string,
		afterCardId?: string,
	): Promise<CardRecord> {
		if (
			beforeCardId === cardId ||
			afterCardId === cardId ||
			(beforeCardId && beforeCardId === afterCardId)
		)
			throw new OptionalException(
				422,
				'Neighbors must be distinct from each other and the moved card',
			);
		return this.withLockedCard(cardId, async (card, source, client) => {
			const lists = new ListsRepository(client);
			const target = await lists.getListById(targetListId);
			if (!target) throw new NotFoundException('Target list not found');
			// Reject before locking a second project; opposite cross-board moves must not deadlock.
			if (target.boardId !== source.boardId)
				throw new OptionalException(
					400,
					'Cannot move card to a list in a different board',
				);
			await lists.lockList(targetListId);
			await this.requireActiveList(lists, target);
			const siblings = (
				await this.cardsRepository.getActiveCardsByListId(targetListId, client)
			).filter((item) => item.id !== cardId);
			const before =
				beforeCardId === undefined
					? -1
					: siblings.findIndex((item) => item.id === beforeCardId);
			const after =
				afterCardId === undefined
					? -1
					: siblings.findIndex((item) => item.id === afterCardId);
			if (
				(beforeCardId !== undefined && before < 0) ||
				(afterCardId !== undefined && after < 0)
			)
				throw new OptionalException(
					422,
					'Neighbors must be active cards in the destination list',
				);
			if (before >= 0 && after >= 0 && before + 1 !== after)
				throw new OptionalException(
					422,
					'Neighbors must be adjacent and ordered',
				);
			const index = after >= 0 ? after : before >= 0 ? before + 1 : siblings.length;
			const position = await this.allocatePosition(
				siblings,
				index,
				targetListId,
				client,
			);
			return this.cardsRepository.updateCardPosition(
				targetListId,
				card.id,
				position,
				client,
			);
		});
	}
	archiveCard(cardId: string, _actorId: string): Promise<CardRecord> {
		return this.withLockedCard(cardId, (_card, _list, client) =>
			this.cardsRepository.archiveCard(cardId, client),
		);
	}
	restoreCard(cardId: string): Promise<CardRecord> {
		return this.withLockedCard(
			cardId,
			async (card, list, client) => {
				await this.requireActiveList(new ListsRepository(client), list);
				if (card.status !== 'ARCHIVED')
					throw new OptionalException(
						400,
						'Only archived cards can be restored',
					);
				return this.cardsRepository.restoreCard(cardId, client);
			},
			false,
		);
	}
	deleteCard(cardId: string, _actorId: string): Promise<CardRecord> {
		return this.withLockedCard(
			cardId,
			async (card, _list, client) => {
				await this.cardsRepository.deleteCard(cardId, client);
				return card;
			},
			false,
		);
	}

	addLabelToCard(cardId: string, labelId: string): Promise<CardLabelRelation> {
		return this.withLockedCard(cardId, async (_card, list, client) => {
			const label = await this.labelsRepository.getLabelById(labelId, client);
			if (!label) throw new NotFoundException('Label not found');
			if (label.boardId !== list.boardId)
				throw new OptionalException(422, 'Label must belong to the card board');
			if (await this.cardLabelsRepository.findLabelOnCard(cardId, labelId, client))
				throw new OptionalException(400, 'Label already exists on the card');
			return this.cardLabelsRepository.addLabelToCard(cardId, labelId, client);
		});
	}
	async removeLabelFromCard(cardId: string, labelId: string): Promise<void> {
		await this.withLockedCard(cardId, async (_card, _list, client) => {
			if (!(await this.labelsRepository.getLabelById(labelId, client)))
				throw new NotFoundException('Label not found');
			await this.cardLabelsRepository.removeLabelFromCard(cardId, labelId, client);
		});
	}

	async addMemberToCard(
		cardId: string,
		userId: string,
		actorId: string,
	): Promise<CardAssignment> {
		const { member, notification } = await this.withLockedCard(
			cardId,
			async (card, list, client) => {
				const membership = await this.boardMembersRepository.isUserMemberOfBoard(
					list.boardId,
					userId,
					client,
				);
				if (!membership)
					throw new NotFoundException('User is not a member of the board');
				if (
					membership.role.status !== 'ACTIVE' ||
					membership.role.deletedAt ||
					!membership.role.name.startsWith('BOARD_') ||
					membership.role.name === 'BOARD_VIEWER'
				)
					throw new OptionalException(
						403,
						'User does not have permission to be assigned to card',
					);
				if (
					await this.cardMembersRepository.findMemberOnCard(
						cardId,
						userId,
						client,
					)
				)
					throw new OptionalException(400, 'User already exists on the card');
				const actor = await this.usersRepository.findUser(
					{ userId: actorId },
					client,
				);
				if (!actor) throw new NotFoundException('Actor not found');
				const member = await this.cardMembersRepository.addMemberToCard(
					cardId,
					userId,
					client,
				);
				const notification =
					userId === actorId
						? null
						: await this.notificationsService.persistCardAssigned(
								{
									recipientUserId: userId,
									actorId,
									actorName: actor.name,
									cardId,
									cardTitle: card.title,
									boardId: list.boardId,
									listId: list.id,
								},
								client,
							);
				return { member, notification };
			},
		);
		if (notification) await this.notificationsService.deliver(notification);
		return member;
	}
	async removeMemberFromCard(cardId: string, userId: string): Promise<void> {
		await this.withLockedCard(cardId, async (_card, _list, client) => {
			const result = await this.cardMembersRepository.removeMemberFromCard(
				cardId,
				userId,
				client,
			);
			if (!result.count)
				throw new NotFoundException('Member is not assigned to this card');
		});
	}

	// Nested content use cases share this lifecycle check and the same parent-locked transaction.
	withLockedCard<T>(
		cardId: string,
		work: (card: CardRecord, list: ListRecord, client: DatabaseClient) => Promise<T>,
		active = true,
	): Promise<T> {
		return this.cardsRepository.inTransaction(async (client) => {
			await this.cardsRepository.lockCard(cardId, client);
			const card = await this.cardsRepository.getCardById(cardId, client);
			if (!card) throw new NotFoundException('Card not found');
			const lists = new ListsRepository(client);
			const list = await lists.getListById(card.listId);
			if (!list) throw new NotFoundException('List not found');
			if (active) {
				await this.requireActiveList(lists, list);
				if (card.status !== 'ACTIVE' || card.deletedAt)
					throw new OptionalException(409, 'Card is read-only');
			}
			return work(card, list, client);
		});
	}
	private async requireActiveList(
		repository: ListsRepository,
		list: ListRecord,
	): Promise<void> {
		const board = await repository.getBoardState(list.boardId);
		if (!board) throw new NotFoundException('Board not found');
		if (
			list.status !== 'ACTIVE' ||
			list.deletedAt ||
			board.status !== 'ACTIVE' ||
			board.deletedAt ||
			board.project.status !== 'ACTIVE' ||
			board.project.deletedAt
		)
			throw new OptionalException(409, 'List or its parent is read-only');
	}
	private async allocatePosition(
		siblings: CardRecord[],
		index: number,
		listId: string,
		client: DatabaseClient,
	): Promise<number> {
		const before = siblings[index - 1]?.position;
		const after = siblings[index]?.position;
		const position = calculateNewPosition(before, after);
		if (isPositionBetween(position, before, after)) return position;
		for (let i = 0; i < siblings.length; i++)
			await this.cardsRepository.updateCardPosition(
				listId,
				siblings[i].id,
				i + 1,
				client,
			);
		return calculateNewPosition(
			index > 0 ? index : undefined,
			index < siblings.length ? index + 1 : undefined,
		);
	}
}
