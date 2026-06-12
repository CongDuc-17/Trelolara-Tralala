import { CardStatusEnum } from '@prisma/client';
import { PrismaService } from '../database';
import { ChecklistsRepository } from '../checklists/checklists.repository';
export class CardsRepository {
	constructor(
		private readonly prismaService = new PrismaService(),
		private readonly checklistRepository = new ChecklistsRepository(),
	) {}

	async getAllCardsByListId(listId: string, status?: string) {
		return this.prismaService.cards.findMany({
			where: { listId: listId, status: status as CardStatusEnum },
			include: {
				cardMembers: {
					include: {
						user: {
							select: {
								id: true,
								name: true,
								avatar: true,
							},
						},
					},
				},
				cardLabels: {
					include: {
						label: {
							select: {
								id: true,
								name: true,
								color: true,
							},
						},
					},
				},
				checklists: {
					include: {
						checklistItems: {
							select: {
								id: true,
								title: true,
								completed: true,
							},
							orderBy: { createdAt: 'asc' },
						},
					},
				},
			},
			orderBy: { position: 'asc' },
		});
	}

	async getLastCardByListId(listId: string) {
		return this.prismaService.cards.findFirst({
			where: { listId: listId, deletedAt: null, status: CardStatusEnum.ACTIVE },
			orderBy: { position: 'desc' },
		});
	}

	async getCardById(cardId: string) {
		return this.prismaService.cards.findUnique({
			where: { id: cardId },
			include: {
				cardMembers: {
					include: {
						user: {
							select: {
								id: true,
								name: true,
								email: true,
								avatar: true,
							},
						},
					},
				},
				cardLabels: {
					include: {
						label: {
							select: {
								id: true,
								name: true,
								color: true,
							},
						},
					},
				},
			},
		});
	}

	async getCardWithCounts(cardId: string) {
		const card = await this.prismaService.cards.findUnique({
			where: { id: cardId },
			select: {
				id: true,
				title: true,
				description: true,
				dueDate: true,
				position: true,
				listId: true,
				createdAt: true,
				_count: {
					select: {
						cardMembers: true,
						cardLabels: true,
						checklists: true,
						comments: true,
					},
				},
			},
		});

		return card;
	}

	async getCardWithIncludes(
		cardId: string,
		include: {
			members?: boolean;
			labels?: boolean;
			checklists?: boolean;
			comments?: boolean;
		},
	) {
		const selectOptions: any = {
			id: true,
			title: true,
			description: true,
			dueDate: true,
			position: true,
			listId: true,
			createdAt: true,
		};

		if (include.members) {
			selectOptions.cardMembers = {
				select: {
					id: true,
					userId: true,
					user: { select: { id: true, name: true, avatar: true } },
				},
			};
		}

		if (include.labels) {
			selectOptions.cardLabels = {
				select: {
					id: true,
					label: { select: { id: true, name: true, color: true } },
				},
			};
		}

		if (include.checklists) {
			selectOptions.checklists = {
				select: {
					id: true,
					title: true,
					checklistItems: {
						select: { id: true, title: true, completed: true },
						orderBy: { createdAt: 'asc' },
					},
				},
			};
		}

		if (include.comments) {
			selectOptions.comments = {
				select: {
					id: true,
					content: true,
					createdAt: true,
					updatedAt: true,
					user: { select: { id: true, name: true, avatar: true } },
				},
				orderBy: { createdAt: 'asc' },
			};
		}

		return this.prismaService.cards.findUnique({
			where: { id: cardId },
			select: selectOptions,
		});
	}

	async getCardInList(cardId: string, listId: string) {
		return this.prismaService.cards.findFirst({
			where: {
				id: cardId,
				listId: listId,
			},
		});
	}

	async createCard(title: string, listId: string, position: number) {
		return this.prismaService.cards.create({
			data: {
				title: title,
				listId: listId,
				position: position,
			},
		});
	}

	async updateCardPosition(targetListId: string, cardId: string, newPosition: number) {
		return this.prismaService.cards.update({
			where: {
				id: cardId,
			},
			data: {
				listId: targetListId,
				position: newPosition,
			},
		});
	}

	async updateInformationCard(
		cardId: string,
		data: {
			title?: string;
			description?: string;
			dueDate?: Date;
		},
	) {
		return this.prismaService.cards.update({
			where: { id: cardId },
			data: {
				title: data.title,
				description: data.description,
				dueDate: data.dueDate,
				updatedAt: new Date(),
			},
		});
	}

	async archiveCard(cardId: string) {
		return this.prismaService.cards.update({
			where: { id: cardId },
			data: { deletedAt: new Date(), status: CardStatusEnum.ARCHIVED },
		});
	}

	async restoreCard(cardId: string) {
		return this.prismaService.cards.update({
			where: { id: cardId },
			data: { deletedAt: null, status: CardStatusEnum.ACTIVE },
		});
	}

	async deleteCard(cardId: string) {
		await this.prismaService.cardMembers.deleteMany({
			where: { cardId: cardId },
		});
		await this.prismaService.cardLabels.deleteMany({
			where: { cardId: cardId },
		});

		const checklists = await this.prismaService.checklists.findMany({
			where: { cardId: cardId },
			select: { id: true },
		});

		for (const checklist of checklists) {
			await this.checklistRepository.deleteChecklist(checklist.id);
		}

		return this.prismaService.cards.delete({
			where: { id: cardId },
		});
	}

	// cardMember
	async addMemberToCard(cardId: string, userId: string[]) {
		if (userId.length === 0) return;
		return this.prismaService.cardMembers.createMany({
			data: userId.map((id) => ({ cardId: cardId, userId: id })),
			skipDuplicates: true,
		});
	}

	async removeMemberFromCard(cardId: string, userId: string[]) {
		if (userId.length === 0) return;
		return this.prismaService.cardMembers.deleteMany({
			where: {
				cardId: cardId,
				userId: { in: userId },
			},
		});
	}

	async getMembersInCard(cardId: string) {
		return this.prismaService.cardMembers.findMany({
			where: { cardId: cardId },
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						avatar: true,
					},
				},
			},
		});
	}
}
