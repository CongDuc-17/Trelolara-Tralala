import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationRecord } from '../notifications/notifications.types';
import { CardReminderRepository, type DueReminder } from './card-reminder.repository';

export class CardReminderService {
	constructor(
		private readonly repository = new CardReminderRepository(),
		private readonly notifications = new NotificationsService(),
	) {}
	process(candidate: DueReminder, clock: () => Date): Promise<NotificationRecord[]> {
		return this.repository.inTransaction(async (client) => {
			await this.repository.lockCard(candidate.cardId, client);
			const schedule = await this.repository.getSchedule(candidate.cardId, client);
			const now = clock();
			if (
				!schedule?.scheduledAt ||
				schedule.revision !== candidate.revision ||
				schedule.scheduledAt > now
			)
				return [];
			const card = await this.repository.getCard(candidate.cardId, client);
			if (
				!card ||
				card.isComplete ||
				[card, card.list, card.list.board, card.list.board.project].some(
					(item) => item.status !== 'ACTIVE' || item.deletedAt,
				)
			)
				return [];
			const records: NotificationRecord[] = [];
			if (
				card.dueDate &&
				card.dueDate > now &&
				card.reminderMinutesBefore !== null
			) {
				const permissions = new PermissionService(
					new PermissionsRepository(client),
				);
				for (const { userId } of card.cardMembers) {
					if (clock() >= card.dueDate) break;
					if (
						!(await permissions.hasBoardPermission(
							userId,
							card.list.boardId,
							['GET_CARD'],
						)) ||
						!(await this.repository.isActiveUser(userId, client))
					)
						continue;
					records.push(
						await this.notifications.persistCardDueSoon(
							{
								recipientUserId: userId,
								cardId: card.id,
								cardTitle: card.title,
								boardId: card.list.boardId,
								listId: card.listId,
								dueDate: card.dueDate.toISOString(),
								reminderRevision: schedule.revision,
							},
							client,
						),
					);
				}
			}
			// Clearing the schedule and creating notifications commit together; retries cannot duplicate records.
			await this.repository.markProcessed(candidate.cardId, client);
			return records;
		});
	}
}
