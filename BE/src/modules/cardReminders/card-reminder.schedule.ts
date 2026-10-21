import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../database';
import type { CardRecord } from '../cards/cards.types';

// Called under the card's parent locks, in the same transaction as the deadline update.
export async function rescheduleCardReminder(
	client: DatabaseClient,
	card: CardRecord,
): Promise<void> {
	if (card.reminderMinutesBefore === null || card.dueDate === null) {
		await client.cardReminders.deleteMany({ where: { cardId: card.id } });
		return;
	}
	const data = {
		revision: randomUUID(),
		scheduledAt: new Date(
			card.dueDate.getTime() - card.reminderMinutesBefore * 60000,
		),
	};
	await client.cardReminders.upsert({
		where: { cardId: card.id },
		create: { cardId: card.id, ...data },
		update: data,
	});
}
