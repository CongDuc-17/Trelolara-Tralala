import 'reflect-metadata';

import { BoardRoleEnum } from '@/common/enums/roles';
import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import { BoardsRepository } from '@/modules/boards/boards.repository';
import { CardLabelsRepository } from '@/modules/cardLabels/cardLabels.repository';
import { CardMembersRepository } from '@/modules/cardMembers/cardMembers.repository';
import { CardsRepository } from '@/modules/cards/card.repository';
import { CardsService } from '@/modules/cards/card.service';
import { CommentsRepository } from '@/modules/comments/comments.repository';
import { CommentsService } from '@/modules/comments/comments.service';
import { DatabaseClient } from '@/modules/database';
import { InvitationsRepository } from '@/modules/invitations/invitation.repository';
import { InvitationService } from '@/modules/invitations/invitation.service';
import { LabelsRepository } from '@/modules/labels/labels.repository';
import { ListsRepository } from '@/modules/lists/list.repository';
import { MailsService } from '@/modules/mails/mail.service';
import {
	NotificationEntityTypeEnum,
	NotificationTypeEnum,
} from '@/modules/notifications/notifications.constants';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { ProjectMembersRepository } from '@/modules/projectMembers/projectMember.repository';
import { ProjectsRepository } from '@/modules/projects/project.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { UsersRepository } from '@/modules/users/users.repository';

const actor = { id: 'actor', name: 'Author', email: 'author@example.com' };
const recipient = { id: 'recipient', name: 'Reader', email: 'reader@example.com' };
const card = {
	id: 'card',
	title: 'Task',
	listId: 'list',
	status: 'ACTIVE',
	deletedAt: null,
};
const now = new Date();
const comment = {
	id: 'comment',
	cardId: card.id,
	userId: actor.id,
	user: actor,
	content: 'Content',
	createdAt: now,
	updatedAt: now,
};

function setup(
	options: {
		failNotification?: boolean;
		noRecipients?: boolean;
		failCommit?: boolean;
		boardMember?: boolean;
	} = {},
) {
	const events: string[] = [];
	let committed: string[] = [];
	let transaction: DatabaseClient;
	const write = (draft: string[], event: string, value: object) =>
		jest.fn(async () => {
			events.push(event);
			draft.push(event);
			return value;
		});
	const notification = {
		id: 'notification',
		userId: recipient.id,
		actorId: actor.id,
		type: NotificationTypeEnum.CARD_COMMENTED,
		title: 'Notification',
		content: 'Content',
		entityType: NotificationEntityTypeEnum.CARD,
		entityId: card.id,
		metadata: null,
		isRead: false,
		readAt: null,
		createdAt: now,
	};
	const client = {
		cards: {
			findUnique: jest.fn(async () => ({
				...card,
				list: { boardId: 'board', board: { projectId: 'project' } },
				cardMembers: [
					{ userId: actor.id },
					...(options.noRecipients ? [] : [{ userId: recipient.id }]),
				],
			})),
		},
		cardComments: { findUnique: jest.fn(async () => comment) },
		cardMembers: { findFirst: jest.fn(async () => null) },
		projectMembers: { findFirst: jest.fn(async () => null) },
		boardMembers: {
			findFirst: jest.fn(async () =>
				options.boardMember === false
					? null
					: {
							userId: recipient.id,
							role: {
								name: BoardRoleEnum.BOARD_MEMBER,
								status: 'ACTIVE',
								deletedAt: null,
							},
						},
			),
		},
		$transaction: jest.fn(async (work: (tx: DatabaseClient) => Promise<unknown>) => {
			const draft = [...committed];
			events.push('begin');
			transaction = {
				$queryRaw: jest.fn(async () => []),
				cards: client.cards,
				lists: {
					findUnique: jest.fn(async () => ({
						id: 'list',
						boardId: 'board',
						status: 'ACTIVE',
						deletedAt: null,
					})),
				},
				boards: {
					findUnique: jest.fn(async () => ({
						id: 'board',
						projectId: 'project',
						status: 'ACTIVE',
						deletedAt: null,
						project: { status: 'ACTIVE', deletedAt: null },
					})),
				},
				cardComments: {
					create: write(draft, 'comment:create', comment),
					update: write(draft, 'comment:update', comment),
				},
				cardMembers: {
					findFirst: client.cardMembers.findFirst,
					create: write(draft, 'assignment', {
						id: 'member',
						cardId: card.id,
						userId: recipient.id,
					}),
				},
				projectMembers: {
					create: write(draft, 'project:member', {
						id: 'member',
						roleId: 'project-role',
					}),
				},
				boardMembers: {
					findFirst: client.boardMembers.findFirst,
					create: write(draft, 'board:member', {
						id: 'member',
						roleId: 'board-role',
					}),
				},
				notifications: {
					create: jest.fn(async () => {
						events.push('notification');
						if (options.failNotification)
							throw new Error('Notification database failure');
						draft.push('notification');
						return notification;
					}),
				},
			} as unknown as DatabaseClient;
			try {
				const result = await work(transaction);
				if (options.failCommit) throw new Error('Commit failure');
				committed = draft;
				events.push('commit');
				return result;
			} catch (error) {
				events.push('rollback');
				throw error;
			}
		}),
	};
	const database = client as unknown as DatabaseClient;
	const persist = jest.fn(async (_input: unknown, tx?: DatabaseClient) => {
		expect(tx).toBe(transaction);
		return tx!.notifications.create({
			data: {
				userId: recipient.id,
				type: NotificationTypeEnum.CARD_COMMENTED,
				title: 'Notification',
				content: 'Content',
			},
		});
	});
	const notifications = {
		persistCardCommented: persist,
		persistCardAssigned: persist,
		persistProjectInvited: persist,
		persistBoardInvited: persist,
		deliver: jest.fn(async () => {
			expect(events[events.length - 1]).toBe('commit');
			events.push('deliver');
		}),
	};
	const users = {
		findUser: jest.fn(async (input: { email?: string }) =>
			input.email ? recipient : actor,
		),
	} as unknown as UsersRepository;
	const lists = {
		getListById: jest.fn(async () => ({ id: card.listId, boardId: 'board' })),
	} as unknown as ListsRepository;
	const cardsRepository = new CardsRepository(database);
	const boardMembers = new BoardMembersRepository(database);
	const notificationsService = notifications as unknown as NotificationsService;
	const comments = new CommentsService(
		new CommentsRepository(database),
		cardsRepository,
		users,
		notificationsService,
		lists,
	);
	const cards = new CardsService(
		cardsRepository,
		lists,
		boardMembers,
		{} as LabelsRepository,
		new CardMembersRepository(database),
		{} as CardLabelsRepository,
		users,
		notificationsService,
	);
	// Only the existing-user branch is exercised: no mail, Cloudinary or database connection.
	const invitations = new InvitationService(
		new InvitationsRepository(database),
		users,
		new ProjectMembersRepository(database),
		boardMembers,
		{
			findById: jest.fn(async (id: string) => ({
				name: id === 'project-role' ? 'PROJECT_MEMBER' : 'BOARD_MEMBER',
			})),
		} as unknown as RolesRepository,
		{
			getProjectById: jest.fn(async () => ({ id: 'project', name: 'Project' })),
		} as unknown as ProjectsRepository,
		{
			getBoardById: jest.fn(async () => ({ id: 'board', name: 'Board' })),
		} as unknown as BoardsRepository,
		{} as MailsService,
		notificationsService,
	);
	return {
		events,
		client,
		persist,
		notifications,
		committed: () => committed,
		operations: {
			'comment:create': () =>
				comments.createComment({
					cardId: card.id,
					userId: actor.id,
					content: 'Content',
				}),
			'comment:update': () =>
				comments.updateComment({
					commentId: comment.id,
					userId: actor.id,
					content: 'Content',
				}),
			assignment: () => cards.addMemberToCard(card.id, recipient.id, actor.id),
			'project:member': () =>
				invitations.inviteUserToProject(
					'project',
					actor.id,
					recipient.email,
					'project-role',
				),
			'board:member': () =>
				invitations.inviteUserToBoard(
					'board',
					actor.id,
					recipient.email,
					'board-role',
				),
		},
		assignSelf: () => cards.addMemberToCard(card.id, actor.id, actor.id),
	};
}

type Operation = keyof ReturnType<typeof setup>['operations'];
const operations: Operation[] = [
	'comment:create',
	'comment:update',
	'assignment',
	'project:member',
	'board:member',
];

describe.each(operations)('%s notification transaction', (operation) => {
	it('uses one transaction for both writes and delivers after commit', async () => {
		const test = setup({ boardMember: operation !== 'board:member' });
		await expect(test.operations[operation]()).resolves.toMatchObject(
			operation === 'assignment' ? { cardId: card.id } : { success: true },
		);
		expect(test.events).toEqual([
			'begin',
			operation,
			'notification',
			'commit',
			'deliver',
		]);
		expect(test.committed()).toEqual([operation, 'notification']);
		expect(test.client.$transaction).toHaveBeenCalledTimes(1);
	});

	it('rolls back the business write if notification persistence fails', async () => {
		const test = setup({
			failNotification: true,
			boardMember: operation !== 'board:member',
		});
		await expect(test.operations[operation]()).rejects.toThrow(
			'Notification database failure',
		);
		expect(test.committed()).toEqual([]);
		expect(test.events[test.events.length - 1]).toBe('rollback');
		expect(test.notifications.deliver).not.toHaveBeenCalled();
	});

	it('does not deliver when the transaction cannot commit', async () => {
		const test = setup({
			failCommit: true,
			boardMember: operation !== 'board:member',
		});
		await expect(test.operations[operation]()).rejects.toThrow('Commit failure');
		expect(test.committed()).toEqual([]);
		expect(test.notifications.deliver).not.toHaveBeenCalled();
	});
});

it.each(['comment:create', 'comment:update'] as const)(
	'commits %s without notifying the actor or absent recipients',
	async (operation) => {
		const test = setup({ noRecipients: true });
		await expect(test.operations[operation]()).resolves.toMatchObject({
			success: true,
		});
		expect(test.persist).not.toHaveBeenCalled();
		expect(test.notifications.deliver).toHaveBeenCalledWith([]);
		expect(test.committed()).toEqual([operation]);
	},
);

it('self-assignment commits without a self-notification', async () => {
	const test = setup();
	await expect(test.assignSelf()).resolves.toMatchObject({ cardId: card.id });
	expect(test.persist).not.toHaveBeenCalled();
	expect(test.notifications.deliver).not.toHaveBeenCalled();
	expect(test.committed()).toEqual(['assignment']);
});
