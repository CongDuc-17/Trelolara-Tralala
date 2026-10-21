import { prisma, runInTransaction, type DatabaseClient } from '../database';
import { CardsRepository } from '../cards/card.repository';

export interface DueReminder {
	cardId: string;
	revision: string;
}
export class CardReminderRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	findDue(now: Date): Promise<DueReminder[]> {
		const active = { status: 'ACTIVE', deletedAt: null } as const;
		return this.client.cardReminders.findMany({
			where: {
				scheduledAt: { lte: now },
				card: {
					...active,
					isComplete: false,
					list: { ...active, board: { ...active, project: active } },
				},
			},
			select: { cardId: true, revision: true },
			orderBy: [{ scheduledAt: 'asc' }, { cardId: 'asc' }],
			take: 20,
		});
	}
	inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
		return runInTransaction(work, this.client);
	}
	lockCard(cardId: string, client: DatabaseClient): Promise<void> {
		return new CardsRepository(client).lockCard(cardId);
	}
	getSchedule(cardId: string, client: DatabaseClient) {
		return client.cardReminders.findUnique({ where: { cardId } });
	}
	getCard(cardId: string, client: DatabaseClient) {
		return client.cards.findUnique({
			where: { id: cardId },
			include: {
				cardMembers: { select: { userId: true } },
				list: { include: { board: { include: { project: true } } } },
			},
		});
	}
	async isActiveUser(userId: string, client: DatabaseClient): Promise<boolean> {
		return (
			(
				await client.users.findUnique({
					where: { id: userId },
					select: { status: true },
				})
			)?.status === 'ACTIVE'
		);
	}
	async markProcessed(cardId: string, client: DatabaseClient): Promise<void> {
		await client.cardReminders.update({
			where: { cardId },
			data: { scheduledAt: null },
		});
	}
}
