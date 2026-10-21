import { NotificationResponseDto } from './dtos';
import { NotificationSocketEvents } from './notifications.constants';
import type { NotificationRecord } from './notifications.types';
import { sendToUser } from '@/socket/socket.server';

export class NotificationsSocketService {
	emitNewNotification(userId: string, notification: NotificationRecord): void {
		sendToUser(userId, {
			event: NotificationSocketEvents.NEW,
			data: new NotificationResponseDto(notification),
		});
	}

	emitUnreadCount(userId: string, count: number): void {
		sendToUser(userId, {
			event: NotificationSocketEvents.UNREAD_COUNT,
			data: { count },
		});
	}
}
