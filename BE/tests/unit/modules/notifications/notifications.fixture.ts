import type { NotificationRecord } from '@/modules/notifications/notifications.types';

export const notification: NotificationRecord = {
	id: '75ce7f3a-6a77-4d12-aa7d-10b3c3375f20',
	userId: 'recipient-1',
	actorId: 'actor-1',
	type: 'CARD_ASSIGNED',
	title: 'You were assigned to a card',
	content: 'Actor assigned you to card Card',
	entityType: 'CARD',
	entityId: 'card-1',
	metadata: { cardId: 'card-1', boardId: 'board-1', listId: 'list-1' },
	isRead: false,
	readAt: null,
	createdAt: new Date('2026-10-21T00:00:00Z'),
};
