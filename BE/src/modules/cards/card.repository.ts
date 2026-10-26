import { prisma, runInTransaction, type DatabaseClient } from '../database';
import { deleteCardTree } from './card-deletion';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { CardPermissionEnum } from '@/common/enums/permissions';
import type {
	CardIncludes,
	CardListEntry,
	CardQuery,
	CardRecord,
	CardStatus,
	CardUpdateInput,
} from './cards.types';

const baseSelect = {
	id: true,
	title: true,
	description: true,
	dueDate: true,
	isComplete: true,
	reminderMinutesBefore: true,
	position: true,
	listId: true,
	createdAt: true,
} as const;
const counts = {
	select: {
		cardMembers: true,
		cardLabels: true,
		checklists: true,
		comments: true,
		attachments: true,
	},
} as const;
const userSelect = { id: true, name: true, avatar: true } as const;

export class CardsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
		return runInTransaction(work, this.client);
	}

	async lockCard(cardId: string, client: DatabaseClient = this.client): Promise<void> {
		const card = await client.cards.findUnique({
			where: { id: cardId },
			select: {
				listId: true,
				list: {
					select: { boardId: true, board: { select: { projectId: true } } },
				},
			},
		});
		if (card) {
			// Read ancestry together: the original list may disappear after a concurrent move.
			await client.$queryRaw`SELECT id FROM "Projects" WHERE id = ${card.list.board.projectId} FOR UPDATE`;
			await client.$queryRaw`SELECT id FROM "Boards" WHERE id = ${card.list.boardId} FOR UPDATE`;
			await client.$queryRaw`SELECT id FROM "Lists" WHERE id = ${card.listId} FOR UPDATE`;
		}
		await client.$queryRaw`SELECT id FROM "Cards" WHERE id = ${cardId} FOR UPDATE`;
	}

	getCardById(
		cardId: string,
		client: DatabaseClient = this.client,
	): Promise<CardRecord | null> {
		return client.cards.findUnique({ where: { id: cardId } });
	}

	getAllCardsByListId(listId: string, status?: CardStatus): Promise<CardListEntry[]> {
		return this.client.cards.findMany({
			where: { listId, status },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
			include: {
				cardMembers: { include: { user: { select: userSelect } } },
				cardLabels: {
					include: { label: { select: { id: true, name: true, color: true } } },
				},
				checklists: {
					include: {
						checklistItems: {
							select: { id: true, title: true, completed: true },
							orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
						},
					},
				},
				_count: { select: { comments: true, attachments: true } },
			},
		});
	}

	getActiveCardsByListId(
		listId: string,
		client: DatabaseClient = this.client,
	): Promise<CardRecord[]> {
		return client.cards.findMany({
			where: { listId, status: 'ACTIVE', deletedAt: null },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
		});
	}

	getCardWithCounts(cardId: string): Promise<CardQuery | null> {
		return this.client.cards.findUnique({
			where: { id: cardId },
			select: { ...baseSelect, _count: counts },
		});
	}

	getCardWithIncludes(
		cardId: string,
		include: CardIncludes,
	): Promise<CardQuery | null> {
		// Keep the dynamic Prisma selection behind the module's fixed projection contract.
		return this.client.cards.findUnique({
			where: { id: cardId },
			select: {
				...baseSelect,
				_count: counts,
				cardMembers: include.members
					? { select: { id: true, userId: true, user: { select: userSelect } } }
					: false,
				cardLabels: include.labels
					? {
							select: {
								id: true,
								label: { select: { id: true, name: true, color: true } },
							},
						}
					: false,
				checklists: include.checklists
					? {
							select: {
								id: true,
								title: true,
								checklistItems: {
									select: { id: true, title: true, completed: true },
									orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
								},
							},
						}
					: false,
				comments: include.comments
					? {
							select: {
								id: true,
								content: true,
								createdAt: true,
								updatedAt: true,
								user: { select: userSelect },
							},
							orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
						}
					: false,
			},
		}) as Promise<CardQuery | null>;
	}

	createCard(
		title: string,
		listId: string,
		position: number,
		client: DatabaseClient = this.client,
	): Promise<CardRecord> {
		return client.cards.create({ data: { title, listId, position } });
	}
	canUpdate(userId: string, boardId: string, client: DatabaseClient): Promise<boolean> {
		return new PermissionService(
			new PermissionsRepository(client),
		).hasBoardPermission(userId, boardId, [CardPermissionEnum.UPDATE_CARD]);
	}
	updateCard(
		cardId: string,
		changes: CardUpdateInput,
		client: DatabaseClient,
	): Promise<CardRecord> {
		return client.cards.update({ where: { id: cardId }, data: changes });
	}
	updateCardPosition(
		listId: string,
		cardId: string,
		position: number,
		client: DatabaseClient = this.client,
	): Promise<CardRecord> {
		return client.cards.update({ where: { id: cardId }, data: { listId, position } });
	}
	archiveCard(
		cardId: string,
		client: DatabaseClient = this.client,
	): Promise<CardRecord> {
		return client.cards.update({
			where: { id: cardId },
			data: { status: 'ARCHIVED', deletedAt: new Date() },
		});
	}
	restoreCard(
		cardId: string,
		client: DatabaseClient = this.client,
	): Promise<CardRecord> {
		return client.cards.update({
			where: { id: cardId },
			data: { status: 'ACTIVE', deletedAt: null },
		});
	}
	deleteCard(cardId: string, client: DatabaseClient = this.client): Promise<void> {
		return deleteCardTree(client, cardId);
	}
}
