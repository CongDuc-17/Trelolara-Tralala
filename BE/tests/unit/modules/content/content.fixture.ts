import { CardsService } from '@/modules/cards/card.service';
import { CardsRepository } from '@/modules/cards/card.repository';
import { ListsRepository } from '@/modules/lists/list.repository';
import { ChecklistsRepository } from '@/modules/checklists/checklists.repository';
import { ChecklistsService } from '@/modules/checklists/checklists.service';
import { ChecklistItemsRepository } from '@/modules/checklistItems/checklistItems.repository';
import { ChecklistItemsService } from '@/modules/checklistItems/checklistItems.service';
import { CommentsRepository } from '@/modules/comments/comments.repository';
import { CommentsService } from '@/modules/comments/comments.service';
import { CardMembersRepository } from '@/modules/cardMembers/cardMembers.repository';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import type { NotificationsSocketService } from '@/modules/notifications/notification.socket';
import type { NotificationRecord } from '@/modules/notifications/notifications.types';
import type {
	ChecklistRecord,
	ChecklistItemRecord,
} from '@/modules/checklists/checklists.types';
import type { CommentRecord } from '@/modules/comments/comments.types';
import type { DatabaseClient } from '@/modules/database';
import { makeCard, now } from '../cards/cards.fixture';

type State = {
	card: ReturnType<typeof makeCard>;
	checklists: ChecklistRecord[];
	items: ChecklistItemRecord[];
	comments: CommentRecord[];
	notifications: NotificationRecord[];
};
const copy = (state: State): State => ({
	card: { ...state.card },
	checklists: state.checklists.map((row) => ({ ...row })),
	items: state.items.map((row) => ({ ...row })),
	comments: state.comments.map((row) => ({ ...row })),
	notifications: [...state.notifications],
});

export function contentFixture() {
	let state: State = {
		card: makeCard('card'),
		checklists: [
			{ id: 'checklist', cardId: 'card', title: 'Tasks', createdAt: now },
			{ id: 'other', cardId: 'other-card', title: 'Other', createdAt: now },
		],
		items: [
			{
				id: 'item',
				checklistId: 'checklist',
				title: 'Task',
				completed: true,
				createdAt: now,
			},
			{
				id: 'other-item',
				checklistId: 'other',
				title: 'Other',
				completed: false,
				createdAt: now,
			},
		],
		comments: [
			{
				id: 'comment',
				cardId: 'card',
				userId: 'actor',
				content: 'Before',
				createdAt: now,
				updatedAt: now,
				user: {
					id: 'actor',
					name: 'Author',
					email: 'author@example.com',
					avatar: null,
				},
			},
		],
		notifications: [],
	};
	const list = {
		id: 'list',
		boardId: 'board',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
	};
	const board = {
		id: 'board',
		projectId: 'project',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
		project: { status: 'ACTIVE', deletedAt: null as Date | null },
	};
	const access = { allowed: true, role: 'BOARD_MEMBER' };
	const failures = { notification: false, commit: false, checklistDelete: false };
	const recipients = ['actor', 'recipient'];
	const events: string[] = [];
	let queue = Promise.resolve();
	let sequence = 0;
	let beforeLock: (() => void) | undefined;

	function models(read: () => State, write: () => State) {
		return {
			cards: {
				findUnique: jest.fn(
					async ({
						where,
						select,
					}: {
						where: { id: string };
						select?: { list?: unknown };
					}) =>
						where.id === read().card.id
							? {
									...read().card,
									...(select?.list
										? {
												list: {
													boardId: 'board',
													board: { projectId: 'project' },
												},
											}
										: {}),
								}
							: null,
				),
				update: jest.fn(async ({ data }: { data: Partial<State['card']> }) =>
					Object.assign(write().card, data),
				),
			},
			lists: { findUnique: jest.fn(async () => list) },
			boards: { findUnique: jest.fn(async () => board) },
			roles: {
				findMany: jest.fn(
					async ({ where }: { where: { boardMembers?: unknown } }) =>
						where.boardMembers && access.allowed
							? [
									{
										name: access.role,
										rolesPermissions: [
											{ permission: { name: 'UPDATE_CARD' } },
										],
									},
								]
							: [],
				),
			},
			cardMembers: {
				findMany: jest.fn(async () => recipients.map((userId) => ({ userId }))),
			},
			checklists: {
				findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
					const row = read().checklists.find((item) => item.id === where.id);
					return row
						? {
								...row,
								checklistItems: read().items.filter(
									(item) => item.checklistId === row.id,
								),
							}
						: null;
				}),
				create: jest.fn(
					async ({ data }: { data: { cardId: string; title: string } }) => {
						const row = { ...data, id: 'new-checklist', createdAt: now };
						write().checklists.push(row);
						events.push('checklist:create');
						return row;
					},
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: { title: string };
					}) =>
						Object.assign(
							write().checklists.find((row) => row.id === where.id)!,
							data,
						),
				),
				delete: jest.fn(async ({ where }: { where: { id: string } }) => {
					if (failures.checklistDelete)
						throw new Error('Checklist delete failed');
					const draft = write();
					draft.checklists = draft.checklists.filter(
						(row) => row.id !== where.id,
					);
					events.push('checklist:delete');
					return {};
				}),
			},
			checklistItems: {
				findUnique: jest.fn(
					async ({ where }: { where: { id: string } }) =>
						read().items.find((row) => row.id === where.id) ?? null,
				),
				create: jest.fn(
					async ({
						data,
					}: {
						data: { checklistId: string; title: string };
					}) => {
						const row = {
							...data,
							id: 'new-item',
							completed: false,
							createdAt: now,
						};
						write().items.push(row);
						events.push('item:create');
						return row;
					},
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: { title?: string; completed?: boolean };
					}) => {
						events.push('item:update');
						return Object.assign(
							write().items.find((row) => row.id === where.id)!,
							data,
						);
					},
				),
				delete: jest.fn(async ({ where }: { where: { id: string } }) => {
					const draft = write();
					const row = draft.items.find((item) => item.id === where.id)!;
					draft.items = draft.items.filter((item) => item.id !== where.id);
					return row;
				}),
				deleteMany: jest.fn(
					async ({ where }: { where: { checklistId: string } }) => {
						const draft = write();
						draft.items = draft.items.filter(
							(row) => row.checklistId !== where.checklistId,
						);
						events.push('items:delete');
						return { count: 1 };
					},
				),
			},
			cardComments: {
				findUnique: jest.fn(
					async ({ where }: { where: { id: string } }) =>
						read().comments.find((row) => row.id === where.id) ?? null,
				),
				findMany: jest.fn(async () => read().comments),
				create: jest.fn(
					async ({
						data,
					}: {
						data: { cardId: string; userId: string; content: string };
					}) => {
						const row = { ...read().comments[0], ...data, id: 'new-comment' };
						write().comments.push(row);
						events.push('comment:create');
						return row;
					},
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: { content: string };
					}) => {
						events.push('comment:update');
						return Object.assign(
							write().comments.find((row) => row.id === where.id)!,
							data,
						);
					},
				),
			},
			notifications: {
				create: jest.fn(
					async ({
						data,
					}: {
						data: Omit<
							NotificationRecord,
							'id' | 'createdAt' | 'isRead' | 'readAt'
						>;
					}) => {
						if (failures.notification) throw new Error('Notification failed');
						const row = {
							...data,
							id: 'notification',
							createdAt: now,
							isRead: false,
							readAt: null,
						};
						write().notifications.push(row);
						events.push('notification');
						return row;
					},
				),
				count: jest.fn(async () => read().notifications.length),
			},
		};
	}
	const root = {
		...models(
			() => state,
			() => {
				throw new Error('Write escaped transaction');
			},
		),
		$transaction: jest.fn(
			async (work: (client: DatabaseClient) => Promise<unknown>) => {
				const txId = ++sequence;
				let draft: State | undefined;
				let release: (() => void) | undefined;
				const scoped = {
					...models(
						() => draft ?? state,
						() => {
							if (!draft) throw new Error('Write before parent lock');
							return draft;
						},
					),
					$queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
						const table = parts.join('?').match(/FROM "(\w+)"/)![1];
						if (table === 'Projects' && !draft) {
							const previous = queue;
							queue = new Promise<void>((resolve) => {
								release = resolve;
							});
							await previous;
							beforeLock?.();
							beforeLock = undefined;
							draft = copy(state);
						}
						events.push(txId + ':lock:' + table);
						return [];
					}),
				} as unknown as DatabaseClient;
				try {
					const result = await work(scoped);
					if (failures.commit) throw new Error('Commit failed');
					if (draft) state = draft;
					events.push('commit');
					return result;
				} catch (error) {
					events.push('rollback');
					throw error;
				} finally {
					release?.();
				}
			},
		),
	};
	const client = root as unknown as DatabaseClient;
	const cards = new CardsService(
		new CardsRepository(client),
		new ListsRepository(client),
	);
	const checklists = new ChecklistsService(new ChecklistsRepository(client), cards);
	const items = new ChecklistItemsService(
		new ChecklistItemsRepository(client),
		checklists,
	);
	const socket = { emitNewNotification: jest.fn(), emitUnreadCount: jest.fn() };
	const notifications = new NotificationsService(
		new NotificationsRepository(client),
		socket as unknown as NotificationsSocketService,
	);
	const comments = new CommentsService(
		new CommentsRepository(client),
		cards,
		notifications,
		new CardMembersRepository(client),
	);
	return {
		cards,
		checklists,
		items,
		comments,
		client,
		root,
		socket,
		list,
		board,
		access,
		failures,
		recipients,
		events,
		state: () => state,
		beforeLock: (work: () => void) => {
			beforeLock = work;
		},
	};
}
