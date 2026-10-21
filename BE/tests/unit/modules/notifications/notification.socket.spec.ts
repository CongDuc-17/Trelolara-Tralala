import { NotificationsSocketService } from '@/modules/notifications/notification.socket';
import { sendToUser } from '@/socket/socket.server';

import { notification } from './notifications.fixture';

jest.mock('@/socket/socket.server', () => ({ sendToUser: jest.fn() }));

describe('Notification socket payload compatibility', () => {
	it('keeps both event names and hides persistence-only user/actor fields', () => {
		const socket = new NotificationsSocketService();
		socket.emitNewNotification(notification.userId, notification);
		socket.emitUnreadCount(notification.userId, 3);
		expect(sendToUser).toHaveBeenNthCalledWith(1, notification.userId, {
			event: 'notification:new',
			data: {
				id: notification.id,
				type: notification.type,
				title: notification.title,
				content: notification.content,
				entityType: 'CARD',
				entityId: 'card-1',
				metadata: notification.metadata,
				isRead: false,
				readAt: undefined,
				createdAt: notification.createdAt,
			},
		});
		expect(sendToUser).toHaveBeenNthCalledWith(2, notification.userId, {
			event: 'notification:unread-count',
			data: { count: 3 },
		});
	});
});
