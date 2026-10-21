import { CardsService } from '@/modules/cards/card.service';
import { CardsRepository } from '@/modules/cards/card.repository';
import { ListsRepository } from '@/modules/lists/list.repository';
import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import { LabelsRepository } from '@/modules/labels/labels.repository';
import { CardMembersRepository } from '@/modules/cardMembers/cardMembers.repository';
import { CardLabelsRepository } from '@/modules/cardLabels/cardLabels.repository';
import { UsersRepository } from '@/modules/users/users.repository';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import type { NotificationsSocketService } from '@/modules/notifications/notification.socket';
import type { DatabaseClient } from '@/modules/database';
import type {
	CardRecord,
	CardAssignment,
	CardLabelRelation,
} from '@/modules/cards/cards.types';
import type { ListRecord } from '@/modules/lists/lists.types';
import type { NotificationRecord } from '@/modules/notifications/notifications.types';

export const now = new Date('2026-10-21T00:00:00Z');
export const makeCard = (id: string, position = 1, listId = 'list'): CardRecord => ({
	id,
	title: id,
	position,
	listId,
	description: null,
	dueDate: null,
	background: null,
	status: 'ACTIVE',
	isComplete: false,
	createdAt: now,
	updatedAt: now,
	deletedAt: null,
});
const makeList = (id: string, boardId = 'board'): ListRecord => ({
	id,
	name: id,
	boardId,
	position: 1,
	status: 'ACTIVE',
	deletedAt: null,
	createdAt: now,
	updatedAt: now,
});
const tables = [
	'checklistItems',
	'checklists',
	'cardComments',
	'cardAttachments',
	'cardActivity',
];

type State = {
	cards: CardRecord[];
	lists: ListRecord[];
	assignments: CardAssignment[];
	relations: CardLabelRelation[];
	notifications: NotificationRecord[];
	children: Record<string, string[]>;
};
const clone = (value: State): State => ({
	cards: value.cards.map((row) => ({ ...row })),
	lists: value.lists.map((row) => ({ ...row })),
	assignments: value.assignments.map((row) => ({ ...row })),
	relations: value.relations.map((row) => ({ ...row })),
	notifications: [...value.notifications],
	children: Object.fromEntries(
		Object.entries(value.children).map(([table, rows]) => [table, [...rows]]),
	),
});

// The transaction double commits drafts only after the callback and models the explicit Project lock.
export function cardFixture(cards = [makeCard('card')]) {
	let state: State = {
		cards: cards.map((row) => ({ ...row })),
		lists: [makeList('list'), makeList('target'), makeList('foreign', 'other-board')],
		assignments: [],
		relations: [],
		notifications: [],
		children: Object.fromEntries(tables.map((table) => [table, ['card', 'other']])),
	};
	let queue = Promise.resolve();
	let sequence = 0;
	const events: string[] = [];
	const failures = {
		notification: false,
		deleteTable: '',
		updateCard: '',
		commit: false,
	};
	const board = {
		id: 'board',
		projectId: 'project',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
		project: { status: 'ACTIVE', deletedAt: null as Date | null },
	};
	const role = {
		name: 'BOARD_MEMBER',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
	};
	const labels = [
		{ id: 'label', boardId: 'board', name: 'Ready', color: 'red' },
		{ id: 'foreign-label', boardId: 'other-board', name: 'Foreign', color: 'blue' },
	];
	const membership = { exists: true };
	const actor = { exists: true };

	function models(current: () => State, writable: () => State, txId: number) {
		return {
			cards: {
				findUnique: jest.fn(
					async ({
						where,
						select,
					}: {
						where: { id: string };
						select?: { list?: unknown };
					}) => {
						const row = current().cards.find((item) => item.id === where.id);
						if (!row) return null;
						const list = current().lists.find(
							(item) => item.id === row.listId,
						)!;
						return select?.list
							? {
									...row,
									list: {
										boardId: list.boardId,
										board: { projectId: board.projectId },
									},
								}
							: { ...row };
					},
				),
				findMany: jest.fn(
					async ({
						where,
					}: {
						where: { listId: string; status?: string; deletedAt?: null };
					}) =>
						current()
							.cards.filter(
								(row) =>
									row.listId === where.listId &&
									(!where.status || row.status === where.status) &&
									(where.deletedAt === undefined ||
										row.deletedAt === null),
							)
							.sort(
								(a, b) =>
									a.position - b.position || a.id.localeCompare(b.id),
							)
							.map((row) => ({ ...row })),
				),
				create: jest.fn(
					async ({
						data,
					}: {
						data: { title: string; listId: string; position: number };
					}) => {
						const row = {
							...makeCard(`created-${txId}`, data.position, data.listId),
							title: data.title,
						};
						writable().cards.push(row);
						return row;
					},
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: Partial<CardRecord>;
					}) => {
						if (failures.updateCard === where.id)
							throw new Error('Card write failed');
						const row = writable().cards.find(
							(item) => item.id === where.id,
						)!;
						Object.assign(row, data);
						events.push(`${txId}:card-write:${row.id}`);
						return { ...row };
					},
				),
				delete: jest.fn(async ({ where }: { where: { id: string } }) => {
					const draft = writable();
					const row = draft.cards.find((item) => item.id === where.id)!;
					draft.cards = draft.cards.filter((item) => item.id !== where.id);
					events.push(`${txId}:delete:cards`);
					return row;
				}),
			},
			lists: {
				findUnique: jest.fn(
					async ({ where }: { where: { id: string } }) =>
						current().lists.find((row) => row.id === where.id) ?? null,
				),
			},
			boards: { findUnique: jest.fn(async () => board) },
			labels: {
				findUnique: jest.fn(
					async ({ where }: { where: { id: string } }) =>
						labels.find((row) => row.id === where.id) ?? null,
				),
			},
			boardMembers: {
				findFirst: jest.fn(async () =>
					membership.exists ? { userId: 'assignee', role } : null,
				),
			},
			users: {
				findFirst: jest.fn(async () =>
					actor.exists ? { id: 'actor', name: 'Author' } : null,
				),
			},
			cardMembers: {
				findFirst: jest.fn(
					async ({ where }: { where: { cardId: string; userId: string } }) =>
						current().assignments.find(
							(row) =>
								row.cardId === where.cardId &&
								row.userId === where.userId,
						) ?? null,
				),
				create: jest.fn(
					async ({ data }: { data: { cardId: string; userId: string } }) => {
						const row = { id: `assignment-${txId}`, ...data };
						writable().assignments.push(row);
						events.push(`${txId}:assignment`);
						return row;
					},
				),
				deleteMany: jest.fn(
					async ({ where }: { where: { cardId: string; userId?: string } }) => {
						const draft = writable();
						const keep = draft.assignments.filter(
							(row) =>
								row.cardId !== where.cardId ||
								(where.userId !== undefined &&
									row.userId !== where.userId),
						);
						const count = draft.assignments.length - keep.length;
						draft.assignments = keep;
						return { count };
					},
				),
			},
			cardLabels: {
				findFirst: jest.fn(
					async ({ where }: { where: { cardId: string; labelId: string } }) =>
						current().relations.find(
							(row) =>
								row.cardId === where.cardId &&
								row.labelId === where.labelId,
						) ?? null,
				),
				create: jest.fn(
					async ({ data }: { data: { cardId: string; labelId: string } }) => {
						const row = { id: `relation-${txId}`, ...data };
						writable().relations.push(row);
						return row;
					},
				),
				deleteMany: jest.fn(
					async ({
						where,
					}: {
						where: { cardId: string; labelId?: string };
					}) => {
						const draft = writable();
						const keep = draft.relations.filter(
							(row) =>
								row.cardId !== where.cardId ||
								(where.labelId !== undefined &&
									row.labelId !== where.labelId),
						);
						const count = draft.relations.length - keep.length;
						draft.relations = keep;
						return { count };
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
							'id' | 'createdAt' | 'readAt' | 'isRead'
						>;
					}) => {
						if (failures.notification)
							throw new Error('Notification write failed');
						const row = {
							...data,
							id: `notification-${txId}`,
							createdAt: now,
							readAt: null,
							isRead: false,
						};
						writable().notifications.push(row);
						events.push(`${txId}:notification`);
						return row;
					},
				),
				count: jest.fn(async () => current().notifications.length),
			},
			...Object.fromEntries(
				tables.map((table) => [
					table,
					{
						deleteMany: jest.fn(
							async ({
								where,
							}: {
								where: {
									cardId?: string;
									checklist?: { cardId: string };
								};
							}) => {
								if (failures.deleteTable === table)
									throw new Error('Child deletion failed');
								const cardId = where.cardId ?? where.checklist!.cardId;
								const draft = writable();
								draft.children[table] = draft.children[table].filter(
									(id) => id !== cardId,
								);
								events.push(`${txId}:delete:${table}`);
								return { count: 1 };
							},
						),
					},
				]),
			),
		};
	}

	const root = {
		...models(
			() => state,
			() => {
				throw new Error('Write escaped transaction');
			},
			0,
		),
		$transaction: jest.fn(
			async (work: (client: DatabaseClient) => Promise<unknown>) => {
				const txId = ++sequence;
				let draft: State | undefined;
				let unlock: (() => void) | undefined;
				const current = () => draft ?? state;
				const scoped = {
					...models(
						current,
						() => {
							if (!draft) throw new Error('Write before parent lock');
							return draft;
						},
						txId,
					),
					$queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
						const table = parts.join('?').match(/FROM "(\w+)"/)![1];
						if (table === 'Projects' && !draft) {
							const previous = queue;
							queue = new Promise<void>((resolve) => {
								unlock = resolve;
							});
							await previous;
							draft = clone(state);
						}
						events.push(`${txId}:lock:${table}`);
						return [];
					}),
				} as unknown as DatabaseClient;
				try {
					const result = await work(scoped);
					if (failures.commit) throw new Error('Commit failed');
					if (draft) state = draft;
					events.push(`${txId}:commit`);
					return result;
				} catch (error) {
					events.push(`${txId}:rollback`);
					throw error;
				} finally {
					unlock?.();
				}
			},
		),
	};
	const client = root as unknown as DatabaseClient;
	const socket = { emitNewNotification: jest.fn(), emitUnreadCount: jest.fn() };
	const notifications = new NotificationsService(
		new NotificationsRepository(client),
		socket as unknown as NotificationsSocketService,
	);
	const service = new CardsService(
		new CardsRepository(client),
		new ListsRepository(client),
		new BoardMembersRepository(client),
		new LabelsRepository(client),
		new CardMembersRepository(client),
		new CardLabelsRepository(client),
		new UsersRepository(client),
		notifications,
	);
	return {
		service,
		client,
		root,
		socket,
		events,
		failures,
		role,
		actor,
		membership,
		board,
		labels,
		state: () => state,
	};
}
