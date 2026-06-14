import { ListStatusEnum } from '@prisma/client';
import { PrismaService } from '../database';
import { CardsRepository } from '../cards/card.repository';

export class ListsRepository {
	constructor(
		private readonly prismaService = new PrismaService(),
		private readonly cardsRepository = new CardsRepository(),
	) {}

	async getAllListsByBoardId(boardId: string, status?: string) {
		return this.prismaService.lists.findMany({
			where: {
				boardId: boardId,

				status: status as ListStatusEnum,
			},
			orderBy: { position: 'asc' },
		});
	}

	async getLastListByBoardId(boardId: string) {
		return this.prismaService.lists.findFirst({
			where: { boardId: boardId, deletedAt: null, status: ListStatusEnum.ACTIVE },
			orderBy: { position: 'desc' },
		});
	}

	async createList(nameList: string, boardId: string, position: number) {
		return this.prismaService.lists.create({
			data: {
				name: nameList,
				boardId: boardId,
				position: position,
			},
		});
	}

	async updateListName(listId: string, nameList: string) {
		return this.prismaService.lists.update({
			where: { id: listId },
			data: { name: nameList },
		});
	}

	async getListById(listId: string) {
		return this.prismaService.lists.findUnique({
			where: { id: listId },
		});
	}

	async updateListPosition(listId: string, newPosition: number) {
		return this.prismaService.lists.update({
			where: { id: listId },
			data: { position: newPosition },
		});
	}

	async archiveList(listId: string) {
		return this.prismaService.lists.update({
			where: { id: listId },
			data: { deletedAt: new Date(), status: ListStatusEnum.ARCHIVED },
		});
	}

	async restoreList(listId: string) {
		return this.prismaService.lists.update({
			where: { id: listId },
			data: { deletedAt: null, status: ListStatusEnum.ACTIVE },
		});
	}

	async deleteList(listId: string) {
		const cards = await this.cardsRepository.getAllCardsByListId(listId);
		await Promise.all(cards.map((card) => this.cardsRepository.deleteCard(card.id)));

		return this.prismaService.lists.delete({
			where: { id: listId },
		});
	}
}
