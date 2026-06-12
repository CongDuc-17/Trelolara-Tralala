import { ListsRepository } from './../lists/list.repository';
import { Exception } from '@tsed/exceptions';

import { HttpResponseBodySuccessDto } from '@/common/dtos/httpResponseBodySuccess.dto';
import { CardsRepository } from './card.repository';

import { calculateNewPosition } from '@/common/utils/calculateNewPosition';
import { BoardsRepository } from '../boards/boards.repository';
import { BoardMembersRepository } from '../boardMembers/boardMember.repository';
import { NotFoundException } from '@/common';
import { LabelsRepository } from '../labels/labels.repository';
import { CardMembersRepository } from '../cardMembers/cardMembers.repository';
import { CardLabelsRepository } from '../cardLabels/cardLabels.repository';
import { CardBasicResponseDto, CardWithIncludesResponseDto } from './dtos';
import { UsersRepository } from '../users/users.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { BoardRoleEnum } from '@/common/enums/roles';

export class CardsService {
	constructor(
		private readonly cardsRepository: CardsRepository = new CardsRepository(),
		private readonly listsRepository: ListsRepository = new ListsRepository(),
		private readonly boardMembersRepository: BoardMembersRepository = new BoardMembersRepository(),
		private readonly labelsRepository: LabelsRepository = new LabelsRepository(),
		private readonly cardMembersRepository: CardMembersRepository = new CardMembersRepository(),
		private readonly cardLabelsRepository: CardLabelsRepository = new CardLabelsRepository(),
		private readonly usersRepository: UsersRepository = new UsersRepository(),
		private readonly notificationsService: NotificationsService = new NotificationsService(),
	) {}

	async getAllCardsByListId(
		listId: string,
		userId: string,
		status?: string,
	): Promise<HttpResponseBodySuccessDto<any[]> | Exception> {
		const list = await this.listsRepository.getListById(listId);
		if (!list) {
			throw new Exception(404, 'List not found');
		}

		const cards = await this.cardsRepository.getAllCardsByListId(listId, status);
		return {
			success: true,
			data: cards,
		};
	}

	async getCardById(
		cardId: string,
		include?: {
			members?: boolean;
			labels?: boolean;
			checklists?: boolean;
			comments?: boolean;
		},
	): Promise<HttpResponseBodySuccessDto<any> | Exception> {
		const card = include
			? await this.cardsRepository.getCardWithIncludes(cardId, include)
			: await this.cardsRepository.getCardWithCounts(cardId);

		if (!card) {
			throw new Exception(404, 'Card not found');
		}

		// Transform to DTO
		const dto = include
			? this.mapToCardWithIncludes(card, include)
			: this.mapToCardBasic(card);

		return {
			success: true,
			data: dto,
		};
	}

	// Helper methods:
	private mapToCardBasic(card: any): CardBasicResponseDto {
		return {
			id: card.id,
			title: card.title,
			description: card.description,
			dueDate: card.dueDate,
			position: card.position,
			listId: card.listId,
			memberCount: card._count?.cardMembers ?? 0,
			labelCount: card._count?.cardLabels ?? 0,
			checklistCount: card._count?.checklists ?? 0,
			commentCount: card._count?.comments ?? 0,
			_links: {
				members: `/cards/${card.id}/members`,
				labels: `/cards/${card.id}/labels`,
				checklists: `/cards/${card.id}/checklists`,
				comments: `/cards/${card.id}/comments`,
			},
			createdAt: card.createdAt,
		};
	}

	private mapToCardWithIncludes(card: any, include: any): CardWithIncludesResponseDto {
		const basic = this.mapToCardBasic(card);

		return {
			// Lấy tất cả từ basic
			id: basic.id,
			title: basic.title,
			description: basic.description,
			dueDate: basic.dueDate,
			position: basic.position,
			listId: basic.listId,
			memberCount: basic.memberCount,
			labelCount: basic.labelCount,
			checklistCount: basic.checklistCount,
			commentCount: basic.commentCount,
			_links: basic._links,
			createdAt: basic.createdAt,
			// Thêm optional fields
			members: include.members
				? card.cardMembers?.map((cm: any) => ({
						id: cm.id,
						userId: cm.userId,
						userName: cm.user.name,
						userAvatar: cm.user.avatar,
					}))
				: undefined,
			labels: include.labels
				? card.cardLabels?.map((cl: any) => ({
						id: cl.label.id,
						name: cl.label.name,
						color: cl.label.color,
					}))
				: undefined,
			checklists: include.checklists
				? card.checklists?.map((c: any) => ({
						id: c.id,
						title: c.title,
						checklistItems: c.checklistItems,
						itemCount: c.checklistItems.length,
						completedCount: c.checklistItems.filter((ci: any) => ci.completed)
							.length,
					}))
				: undefined,

			comments: include.comments
				? card.comments?.map((cm: any) => ({
						id: cm.id,
						content: cm.content,
						createdAt: cm.createdAt,
						updatedAt: cm.updatedAt,
						userName: cm.user.name,
						userAvatar: cm.user.avatar,
					}))
				: undefined,
		} as CardWithIncludesResponseDto;
	}

	async createCard(
		title: string,
		listId: string,
		userId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const list = await this.listsRepository.getListById(listId);
		if (!list) {
			throw new Exception(404, 'List not found');
		}

		const lastCard = await this.cardsRepository.getLastCardByListId(listId);
		const position = lastCard ? lastCard.position + 1 : 1;
		const newCard = await this.cardsRepository.createCard(title, listId, position);
		return {
			success: true,
			data: newCard,
		};
	}

	async moveCard(
		cardId: string,
		targetListId: string,
		userId: string,
		beforeCardId?: string,
		afterCardId?: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		try {
			const card = await this.cardsRepository.getCardById(cardId);
			if (!card) throw new Exception(404, 'Card not found');

			const sourceList = await this.listsRepository.getListById(card.listId);
			if (!sourceList) throw new Exception(404, 'Source list not found');

			const targetList = await this.listsRepository.getListById(targetListId);
			if (!targetList) throw new Exception(404, 'Target list not found');

			if (sourceList.boardId !== targetList.boardId) {
				throw new Exception(
					400,
					'Cannot move card to a list in a different board',
				);
			}

			const before = beforeCardId
				? await this.cardsRepository.getCardInList(beforeCardId, targetListId)
				: null;
			const after = afterCardId
				? await this.cardsRepository.getCardInList(afterCardId, targetListId)
				: null;

			const newPosition = calculateNewPosition(before?.position, after?.position);
			console.log('New Position:', newPosition);
			const updatedCard = await this.cardsRepository.updateCardPosition(
				targetListId,
				cardId,
				newPosition,
			);
			console.log('Updated Card:', updatedCard);
			return {
				success: true,
				data: updatedCard,
			};
		} catch (error) {
			console.error('[CardsService] moveCard error:', error);
			throw error;
		}
	}

	async archiveCard(
		cardId: string,
		userId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		try {
			const card = await this.cardsRepository.getCardById(cardId);
			if (!card) throw new Exception(404, 'Card not found');

			const list = await this.listsRepository.getListById(card.listId);
			if (!list) {
				throw new Exception(404, 'List not found');
			}

			const archivedCard = await this.cardsRepository.archiveCard(cardId);
			return {
				success: true,
				data: archivedCard,
			};
		} catch (error) {
			throw error;
		}
	}

	async restoreCard(
		cardId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) {
			throw new Exception(404, 'Card not found');
		}
		const list = await this.listsRepository.getListById(card.listId);
		if (!list) {
			throw new Exception(404, 'List not found');
		}
		const restoredCard = await this.cardsRepository.restoreCard(cardId);
		return {
			success: true,
			data: restoredCard,
		};
	}

	async deleteCard(
		cardId: string,
		userId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		try {
			const card = await this.cardsRepository.getCardById(cardId);
			if (!card) throw new Exception(404, 'Card not found');

			const deletedCard = await this.cardsRepository.deleteCard(cardId);
			return {
				success: true,
				data: deletedCard,
			};
		} catch (error) {
			throw error;
		}
	}

	async addLabelToCard(
		cardId: string,
		labelId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) throw new NotFoundException('Card not found');
		const label = await this.labelsRepository.getLabelById(labelId);
		if (!label) throw new NotFoundException('Label not found');
		const duplicateAdd = await this.cardLabelsRepository.findLabelOnCard(
			cardId,
			labelId,
		);
		if (duplicateAdd) {
			throw new Exception(400, 'Label already exists on the card');
		}

		const addedLabel = await this.cardLabelsRepository.addLabelToCard(
			cardId,
			labelId,
		);
		return {
			success: true,
			data: addedLabel,
		};
	}

	async removeLabelFromCard(
		cardId: string,
		labelId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) throw new NotFoundException('Card not found');
		const label = await this.labelsRepository.getLabelById(labelId);
		if (!label) throw new NotFoundException('Label not found');
		await this.cardLabelsRepository.removeLabelFromCard(cardId, labelId);
		return {
			success: true,
			data: null,
		};
	}

	async addMemberToCard(
		cardId: string,
		userId: string,
		currentUserId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) throw new NotFoundException('Card not found');
		const list = await this.listsRepository.getListById(card.listId);
		if (!list) throw new NotFoundException('List not found');
		const isMember = await this.boardMembersRepository.isUserMemberOfBoard(
			list.boardId,
			userId,
		);
		if (!isMember) {
			throw new NotFoundException('User is not a member of the board');
		}

		if (isMember.role.name === BoardRoleEnum.BOARD_VIEWER) {
			throw new Exception(
				403,
				'User does not have permission to be assigned to card',
			);
		}

		const duplicateAdd = await this.cardMembersRepository.findMemberOnCard(
			cardId,
			userId,
		);
		if (duplicateAdd) {
			throw new Exception(400, 'User already exists on the card');
		}

		const addedMember = await this.cardMembersRepository.addMemberToCard(
			cardId,
			userId,
		);
		const actor = await this.usersRepository.findUser({
			userId: currentUserId,
		});
		if (!actor) {
			throw new NotFoundException('Actor not found');
		}

		if (userId !== currentUserId) {
			await this.notificationsService.notifyCardAssigned({
				recipientUserId: userId,
				actorId: currentUserId,
				actorName: actor.name,
				cardId: card.id,
				cardTitle: card.title,
				boardId: list.boardId,
				listId: card.listId,
			});
		}
		return {
			success: true,
			data: addedMember,
		};
	}

	async removeMemberFromCard(
		cardId: string,
		userId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		try {
			const card = await this.cardsRepository.getCardById(cardId);
			if (!card) throw new NotFoundException('Card not found');
			const list = await this.listsRepository.getListById(card.listId);
			if (!list) throw new NotFoundException('List not found');
			const isMember = await this.boardMembersRepository.isUserMemberOfBoard(
				list.boardId,
				userId,
			);
			if (!isMember) {
				throw new NotFoundException('User is not a member of the board');
			}

			// Check if member actually exists on card
			const memberOnCard = await this.cardMembersRepository.findMemberOnCard(
				cardId,
				userId,
			);
			if (!memberOnCard) {
				console.warn(
					`[CardsService] Member ${userId} not found on card ${cardId}`,
				);
				throw new NotFoundException('Member is not assigned to this card');
			}

			const result = await this.cardMembersRepository.removeMemberFromCard(
				cardId,
				userId,
			);

			if (result.count === 0) {
				throw new Exception(500, 'Failed to remove member from card');
			}

			return {
				success: true,
				data: null,
			};
		} catch (error) {
			console.error('[CardsService] removeMemberFromCard error:', error);
			throw error;
		}
	}
}
