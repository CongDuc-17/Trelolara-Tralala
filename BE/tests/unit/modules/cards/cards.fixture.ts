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
import type { AttachmentRecord } from '@/modules/attachments/attachments.types';
import type { CleanupJob } from '@/modules/attachments/attachment-cleanup.repository';
import type { CardActivityRecord } from '@/modules/cardActivities/cardActivities.types';

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
	reminderMinutesBefore: null,
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
	reminders: { cardId: string; revision: string; scheduledAt: Date | null }[];
	attachments: AttachmentRecord[];
	cleanupJobs: (CleanupJob & { legacyFileUrl?: string | null })[];
	cards: CardRecord[];
	lists: ListRecord[];
	assignments: CardAssignment[];
	relations: CardLabelRelation[];
	notifications: NotificationRecord[];
	activities: Omit<CardActivityRecord, 'user'>[];
	children: Record<string, string[]>;
};
const clone = (value: State): State => ({
	reminders: value.reminders.map((row) => ({ ...row })),
	attachments: value.attachments.map((row) => ({ ...row })),
	cleanupJobs: value.cleanupJobs.map((row) => ({ ...row })),
	cards: value.cards.map((row) => ({ ...row })),
	lists: value.lists.map((row) => ({ ...row })),
	assignments: value.assignments.map((row) => ({ ...row })),
	relations: value.relations.map((row) => ({ ...row })),
	notifications: [...value.notifications],
	activities: value.activities.map((row) => ({ ...row })),
	children: Object.fromEntries(
		Object.entries(value.children).map(([table, rows]) => [table, [...rows]]),
	),
});

// The transaction double commits drafts only after the callback and models the explicit Project lock.
export function cardFixture(cards = [makeCard('card')]) {
	let state: State = {
		reminders: [],
		attachments: [],
		cleanupJobs: [],
		cards: cards.map((row) => ({ ...row })),
		lists: [makeList('list'), makeList('target'), makeList('foreign', 'other-board')],
		assignments: [],
		relations: [],
		notifications: [],
		activities: [],
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
		activity: false,
		attachment: false,
		cleanupJob: false,
		expedite: false,
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
	const access = {
		allowed: true,
		role: 'BOARD_MEMBER',
		systemAdmin: false,
		projectAllowed: false,
	};

	function models(current: () => State, writable: () => State, txId: number) {
		const jobs = () => (txId === 0 ? state.cleanupJobs : writable().cleanupJobs);
		const matchesAttachment = (
			row: AttachmentRecord,
			where: { id?: string; cardId?: string },
		) =>
			(!where.id || where.id === row.id) &&
			(!where.cardId || where.cardId === row.cardId);
		return {
			cardReminders: {
				findUnique: jest.fn(
					async ({ where }: { where: { cardId: string } }) =>
						current().reminders.find((row) => row.cardId === where.cardId) ??
						null,
				),
				findMany: jest.fn(
					async ({ where }: { where: { scheduledAt: { lte: Date } } }) =>
						current().reminders.filter(
							(row) =>
								row.scheduledAt &&
								row.scheduledAt <= where.scheduledAt.lte,
						),
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { cardId: string };
						data: { scheduledAt: Date | null };
					}) => {
						const row = writable().reminders.find(
							(item) => item.cardId === where.cardId,
						)!;
						Object.assign(row, data);
						return row;
					},
				),
				deleteMany: jest.fn(async ({ where }: { where: { cardId: string } }) => {
					writable().reminders = writable().reminders.filter(
						(row) => row.cardId !== where.cardId,
					);
					return { count: 1 };
				}),
				upsert: jest.fn(
					async ({
						where,
						create,
						update,
					}: {
						where: { cardId: string };
						create: State['reminders'][number];
						update: Partial<State['reminders'][number]>;
					}) => {
						const existing = writable().reminders.find(
							(row) => row.cardId === where.cardId,
						);
						if (existing) Object.assign(existing, update);
						else writable().reminders.push({ ...create });
						return existing ?? create;
					},
				),
			},
			attachmentCleanupJobs: {
				create: jest.fn(
					async ({ data }: { data: Partial<CleanupJob> & { id: string } }) => {
						const row = {
							publicId: null,
							resourceType: null,
							deliveryType: null,
							leaseId: null,
							leaseUntil: null,
							attempts: 0,
							availableAt: new Date(),
							...data,
						};
						jobs().push(row);
						return row;
					},
				),
				createMany: jest.fn(
					async ({
						data,
					}: {
						data: (Partial<CleanupJob> & { id: string })[];
					}) => {
						if (failures.cleanupJob)
							throw new Error('Cleanup job write failed');
						for (const row of data)
							if (!jobs().some((job) => job.id === row.id))
								jobs().push({
									publicId: null,
									resourceType: null,
									deliveryType: null,
									leaseId: null,
									leaseUntil: null,
									attempts: 0,
									availableAt: new Date(),
									...row,
								});
						return { count: data.length };
					},
				),
				deleteMany: jest.fn(
					async ({
						where,
					}: {
						where: {
							id: string;
							leaseId?: string | null;
							availableAt?: { gt: Date };
						};
					}) => {
						const rows = jobs();
						const index = rows.findIndex(
							(job) =>
								job.id === where.id &&
								(where.leaseId === undefined ||
									job.leaseId === where.leaseId) &&
								(!where.availableAt ||
									(job.availableAt &&
										job.availableAt > where.availableAt.gt)),
						);
						if (index < 0) return { count: 0 };
						rows.splice(index, 1);
						return { count: 1 };
					},
				),
				updateMany: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: Partial<CleanupJob>;
					}) => {
						if (failures.expedite) throw new Error('Expedite failed');
						const job = jobs().find((row) => row.id === where.id);
						if (!job) return { count: 0 };
						Object.assign(job, data);
						return { count: 1 };
					},
				),
			},
			cards: {
				findUnique: jest.fn(
					async ({
						where,
						select,
						include,
					}: {
						where: { id: string };
						select?: { list?: unknown };
						include?: unknown;
					}) => {
						const row = current().cards.find((item) => item.id === where.id);
						if (!row) return null;
						const list = current().lists.find(
							(item) => item.id === row.listId,
						)!;
						if (include)
							return {
								...row,
								cardMembers: current().assignments.filter(
									(member) => member.cardId === row.id,
								),
								list: { ...list, board },
							};
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
						Object.assign(row, data, {
							updatedAt: new Date(now.getTime() + txId),
						});
						events.push(`${txId}:card-write:${row.id}`);
						return { ...row };
					},
				),
				delete: jest.fn(async ({ where }: { where: { id: string } }) => {
					const draft = writable();
					const row = draft.cards.find((item) => item.id === where.id)!;
					draft.cards = draft.cards.filter((item) => item.id !== where.id);
					draft.reminders = draft.reminders.filter(
						(item) => item.cardId !== where.id,
					);
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
			roles: {
				findMany: jest.fn(
					async ({
						where,
					}: {
						where: {
							usersRoles?: unknown;
							boardMembers?: unknown;
							projectMembers?: unknown;
						};
					}) => {
						if (where.usersRoles && access.systemAdmin)
							return [{ name: 'ADMIN', rolesPermissions: [] }];
						if (
							(where.boardMembers && access.allowed) ||
							(where.projectMembers && access.projectAllowed)
						)
							return [
								{
									name: where.projectMembers
										? 'PROJECT_MEMBER'
										: access.role,
									rolesPermissions: [
										'GET_CARD',
										'UPDATE_CARD',
										'DELETE_CARD',
									].map((name) => ({ permission: { name } })),
								},
							];
						return [];
					},
				),
			},
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
				findUnique: jest.fn(async () => ({ status: 'ACTIVE' })),
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
									id?: string;
									checklist?: { cardId: string };
								};
							}) => {
								if (failures.deleteTable === table)
									throw new Error('Child deletion failed');
								const cardId = where.cardId ?? where.checklist!.cardId;
								const draft = writable();
								if (table === 'cardAttachments')
									draft.attachments = draft.attachments.filter(
										(row) => !matchesAttachment(row, where),
									);
								if (table === 'cardActivity')
									draft.activities = draft.activities.filter(
										(row) => row.cardId !== cardId,
									);
								draft.children[table] = draft.children[table].filter(
									(id) => id !== cardId,
								);
								events.push(`${txId}:delete:${table}`);
								return { count: 1 };
							},
						),
						...(table === 'cardAttachments'
							? {
									findMany: jest.fn(
										async ({
											where,
										}: {
											where: { id?: string; cardId?: string };
										}) =>
											current().attachments.filter((row) =>
												matchesAttachment(row, where),
											),
									),
									findFirst: jest.fn(
										async ({
											where,
										}: {
											where: { id?: string; cardId?: string };
										}) =>
											current().attachments.find((row) =>
												matchesAttachment(row, where),
											) ?? null,
									),
									create: jest.fn(
										async ({
											data,
										}: {
											data: Omit<AttachmentRecord, 'createdAt'>;
										}) => {
											if (failures.attachment)
												throw new Error(
													'Attachment write failed',
												);
											const row = { ...data, createdAt: now };
											writable().attachments.push(row);
											return row;
										},
									),
								}
							: {}),
						...(table === 'cardActivity'
							? {
									create: jest.fn(
										async ({
											data,
										}: {
											data: {
												cardId: string;
												userId: string;
												action: string;
												metadata: CardActivityRecord['metadata'];
											};
										}) => {
											if (failures.activity)
												throw new Error('Activity write failed');
											const row = {
												id: `activity-${txId}-${writable().activities.length}`,
												details: null,
												createdAt: now,
												...data,
											};
											writable().activities.push(row);
											events.push(`${txId}:activity`);
											return row;
										},
									),
								}
							: {}),
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
		access,
		membership,
		board,
		labels,
		state: () => state,
	};
}
