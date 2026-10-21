import type { DatabaseClient } from '@/modules/database';
import { NotificationsSocketService } from '@/modules/notifications/notification.socket';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';

import { notification } from './notifications.fixture';

jest.mock('@/socket/socket.server', () => ({ sendToUser: jest.fn() }));

function setup() {
	const repository = {
		createOne: jest.fn(async () => notification),
		countUnreadByUserId: jest.fn(async () => 3),
		findManyByUserId: jest.fn(async () => ({ items: [notification], total: 1 })),
		markAsRead: jest.fn(async () => true),
		markAllAsRead: jest.fn(async () => undefined),
	};
	const socket = { emitNewNotification: jest.fn(), emitUnreadCount: jest.fn() };
	return {
		service: new NotificationsService(
			repository as unknown as NotificationsRepository,
			socket as unknown as NotificationsSocketService,
		),
		repository,
		socket,
	};
}

describe('Notification persistence and post-commit delivery', () => {
	it('persists all four notification kinds using the supplied transaction without sending events', async () => {
		const { service, repository, socket } = setup();
		const transaction = {} as DatabaseClient;
		const shared = {
			recipientUserId: 'recipient-1',
			actorId: 'actor-1',
			actorName: 'Actor',
		};
		await service.persistProjectInvited(
			{ ...shared, projectId: 'project-1', projectName: 'Project' },
			transaction,
		);
		await service.persistBoardInvited(
			{ ...shared, boardId: 'board-1', boardName: 'Board' },
			transaction,
		);
		await service.persistCardAssigned(
			{
				...shared,
				cardId: 'card-1',
				cardTitle: 'Card',
				boardId: 'board-1',
				listId: 'list-1',
			},
			transaction,
		);
		await service.persistCardCommented(
			{
				...shared,
				cardId: 'card-1',
				cardTitle: 'Card',
				boardId: 'board-1',
				content: 'Hello',
			},
			transaction,
		);
		for (const [index, type] of [
			'PROJECT_INVITED',
			'BOARD_INVITED',
			'CARD_ASSIGNED',
			'CARD_COMMENTED',
		].entries()) {
			expect(repository.createOne).toHaveBeenNthCalledWith(
				index + 1,
				expect.objectContaining({
					recipientUserId: 'recipient-1',
					type,
				}),
				transaction,
			);
		}
		expect(repository.createOne).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: 'Actor commented on card Card: "Hello"',
				metadata: {
					cardId: 'card-1',
					cardTitle: 'Card',
					actorName: 'Actor',
					commentContent: 'Hello',
					boardId: 'board-1',
				},
			}),
			transaction,
		);
		expect(socket.emitNewNotification).not.toHaveBeenCalled();
		expect(repository.countUnreadByUserId).not.toHaveBeenCalled();
	});

	it('propagates persistence errors so the caller can roll back its transaction', async () => {
		const { service, repository, socket } = setup();
		const failure = new Error('Database unavailable');
		repository.createOne.mockRejectedValueOnce(failure);
		await expect(
			service.persistBoardInvited({
				recipientUserId: 'user',
				actorName: 'Actor',
				boardId: 'board',
				boardName: 'Board',
			}),
		).rejects.toBe(failure);
		expect(socket.emitNewNotification).not.toHaveBeenCalled();
	});

	it('delivers only when explicitly requested and refreshes the unread count once per recipient', async () => {
		const { service, repository, socket } = setup();
		await service.deliver([notification, { ...notification, id: 'notification-2' }]);
		expect(socket.emitNewNotification).toHaveBeenCalledTimes(2);
		expect(socket.emitNewNotification).toHaveBeenCalledWith(
			notification.userId,
			notification,
		);
		expect(repository.countUnreadByUserId).toHaveBeenCalledTimes(1);
		expect(socket.emitUnreadCount).toHaveBeenCalledWith(notification.userId, 3);
	});

	it('contains socket and unread-query failures after commit and continues other recipients without leaking details', async () => {
		const { service, repository, socket } = setup();
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		socket.emitNewNotification.mockImplementationOnce(() => {
			throw new Error('secret-token');
		});
		repository.countUnreadByUserId.mockRejectedValueOnce(new Error('secret-token'));
		await expect(
			service.deliver([
				notification,
				{ ...notification, id: 'other', userId: 'other-recipient' },
			]),
		).resolves.toBeUndefined();
		expect(socket.emitNewNotification).toHaveBeenCalledTimes(2);
		expect(socket.emitUnreadCount).toHaveBeenCalledWith('other-recipient', 3);
		expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-token');
	});

	it('contains unread event failures and handles an empty batch without extra queries', async () => {
		const { service, repository, socket } = setup();
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		socket.emitUnreadCount.mockImplementationOnce(() => {
			throw new Error('socket closed');
		});
		await expect(service.deliver(notification)).resolves.toBeUndefined();
		repository.countUnreadByUserId.mockClear();
		await service.deliver([]);
		expect(repository.countUnreadByUserId).not.toHaveBeenCalled();
	});

	it('returns plain page/count data and translates only a missing owned notification into not-found', async () => {
		const { service, repository } = setup();
		await expect(
			service.getMyNotifications('recipient-1', {
				page: 3,
				limit: 5,
				isRead: false,
			}),
		).resolves.toEqual({ items: [notification], total: 1 });
		expect(repository.findManyByUserId).toHaveBeenCalledWith({
			userId: 'recipient-1',
			skip: 10,
			take: 5,
			isRead: false,
		});
		await expect(service.getMyUnreadCount('recipient-1')).resolves.toBe(3);
		await expect(
			service.markAsRead(notification.id, 'recipient-1'),
		).resolves.toBeUndefined();
		repository.markAsRead.mockResolvedValueOnce(false);
		await expect(
			service.markAsRead(notification.id, 'outsider'),
		).rejects.toMatchObject({ status: 404 });
		await service.markAllAsRead('recipient-1');
		expect(repository.markAllAsRead).toHaveBeenCalledWith('recipient-1');
	});
});
