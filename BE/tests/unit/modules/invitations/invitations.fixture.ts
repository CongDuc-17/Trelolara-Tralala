import { InvitationsRepository } from '@/modules/invitations/invitation.repository';
import { InvitationService } from '@/modules/invitations/invitation.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import type { NotificationsSocketService } from '@/modules/notifications/notification.socket';
import type { MailsService } from '@/modules/mails/mail.service';
import type {
	InvitationRecord,
	InvitationScope,
} from '@/modules/invitations/invitations.types';
import type { NotificationRecord } from '@/modules/notifications/notifications.types';
import type { DatabaseClient } from '@/modules/database';

type Member = {
	id: string;
	projectId?: string;
	boardId?: string;
	userId: string;
	roleId: string;
	accepted: boolean;
};
type State = {
	invitations: InvitationRecord[];
	members: Member[];
	notifications: NotificationRecord[];
};
const clone = (state: State): State => ({
	invitations: state.invitations.map((row) => ({ ...row })),
	members: state.members.map((row) => ({ ...row })),
	notifications: [...state.notifications],
});

export function invitationFixture(scope: InvitationScope = 'board', hasAccount = true) {
	let state: State = { invitations: [], members: [], notifications: [] };
	let queue = Promise.resolve();
	let sequence = 0;
	const events: string[] = [];
	const failures = { commit: false, notification: false, status: false };
	const users = ['actor', ...(hasAccount ? ['recipient'] : []), 'second', 'admin'].map(
		(id) => ({
			id,
			name: id,
			email: id + '@example.com',
			verify: true,
			status: 'ACTIVE',
			deletedAt: null as Date | null,
		}),
	);
	const roles = [
		'BOARD_MEMBER',
		'BOARD_VIEWER',
		'BOARD_ADMIN',
		'PROJECT_MEMBER',
		'PROJECT_VIEWER',
		'PROJECT_ADMIN',
	].map((name) => ({
		id: name,
		name,
		status: 'ACTIVE',
		deletedAt: null as Date | null,
	}));
	const allowed = new Set(['actor']);
	const admins = new Set(['admin']);
	const project = {
		id: 'project',
		name: 'Project',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
	};
	const board = {
		id: 'board',
		name: 'Board',
		projectId: 'project',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
		project,
	};
	const roleId = scope.toUpperCase() + '_MEMBER';
	const targetId = scope;

	function models(read: () => State, write: () => State) {
		const memberModel = (key: 'projectId' | 'boardId') => ({
			findFirst: jest.fn(
				async ({
					where,
				}: {
					where: { userId: string; projectId?: string; boardId?: string };
				}) =>
					read().members.find(
						(row) => row.userId === where.userId && row[key] === where[key],
					) ?? null,
			),
			create: jest.fn(async ({ data }: { data: Omit<Member, 'id'> }) => {
				const row = { ...data, id: 'member-' + sequence };
				write().members.push(row);
				events.push('member');
				return row;
			}),
		});
		return {
			projects: {
				findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
					where.id === 'project' ? project : null,
				),
			},
			boards: {
				findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
					where.id === 'board' ? board : null,
				),
			},
			users: {
				findFirst: jest.fn(
					async ({
						where,
					}: {
						where: { id?: string; email?: { equals: string } };
					}) =>
						users.find((user) =>
							where.id
								? user.id === where.id
								: user.email.toLowerCase() ===
									where.email?.equals.toLowerCase(),
						) ?? null,
				),
			},
			roles: {
				findFirst: jest.fn(
					async ({ where }: { where: { id?: string; name?: string } }) =>
						roles.find((row) =>
							where.id ? row.id === where.id : row.name === where.name,
						) ?? null,
				),
				findMany: jest.fn(
					async ({
						where,
					}: {
						where: {
							usersRoles?: { some: { userId: string } };
							projectMembers?: { some: { userId: string } };
							boardMembers?: { some: { userId: string } };
						};
					}) => {
						const id =
							where.usersRoles?.some.userId ??
							where.projectMembers?.some.userId ??
							where.boardMembers?.some.userId;
						if (where.usersRoles)
							return admins.has(id!)
								? [{ name: 'ADMIN', rolesPermissions: [] }]
								: [];
						return allowed.has(id!)
							? [
									{
										name: where.projectMembers
											? 'PROJECT_MEMBER'
											: 'BOARD_MEMBER',
										rolesPermissions: [
											{ permission: { name: 'INVITE_MEMBER' } },
										],
									},
								]
							: [];
					},
				),
			},
			projectMembers: memberModel('projectId'),
			boardMembers: memberModel('boardId'),
			invitations: {
				findUnique: jest.fn(
					async ({ where }: { where: { token: string } }) =>
						read().invitations.find((row) => row.token === where.token) ??
						null,
				),
				findMany: jest.fn(
					async ({
						where,
					}: {
						where: {
							email: { equals: string };
							projectId?: string | null;
							boardId?: string | null;
							expiresAt: { gt: Date };
						};
					}) =>
						read().invitations.filter(
							(row) =>
								row.email?.toLowerCase() ===
									where.email.equals.toLowerCase() &&
								row.type === 'EMAIL' &&
								row.status === 'PENDING' &&
								row.expiresAt > where.expiresAt.gt &&
								row.projectId === (where.projectId ?? null) &&
								row.boardId === (where.boardId ?? null),
						),
				),
				create: jest.fn(async ({ data }: { data: Partial<InvitationRecord> }) => {
					const row: InvitationRecord = {
						id: 'invitation-' + sequence,
						projectId: null,
						boardId: null,
						email: '',
						roleId,
						createdBy: 'actor',
						token: 'token',
						type: 'EMAIL',
						status: 'PENDING',
						createdAt: new Date(),
						acceptedAt: null,
						expiresAt: new Date(Date.now() + 60000),
						...data,
					};
					write().invitations.push(row);
					events.push('invitation');
					return row;
				}),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: Partial<InvitationRecord>;
					}) => {
						if (failures.status) throw new Error('Status write failed');
						const row = write().invitations.find(
							(item) => item.id === where.id,
						)!;
						Object.assign(row, data);
						events.push('status');
						return row;
					},
				),
			},
			notifications: {
				findFirst: jest.fn(
					async ({
						where,
					}: {
						where: { userId: string; metadata: { equals: string } };
					}) =>
						read().notifications.find(
							(row) =>
								row.userId === where.userId &&
								(row.metadata as Record<string, string>).invitationId ===
									where.metadata.equals,
						) ?? null,
				),
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
							id: 'notification-' + sequence,
							createdAt: new Date(),
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
				++sequence;
				let draft: State | undefined;
				let release: (() => void) | undefined;
				const scoped = {
					...models(
						() => draft ?? state,
						() => {
							if (!draft) throw new Error('Write before target lock');
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
							draft = clone(state);
						}
						events.push('lock:' + table);
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
	const socket = { emitNewNotification: jest.fn(), emitUnreadCount: jest.fn() };
	const mails = {
		sendEmail: jest.fn(
			async (_input: { recipients: string[]; subject: string; text: string }) => {
				events.push('email');
				return { success: true as const };
			},
		),
	};
	const notifications = new NotificationsService(
		new NotificationsRepository(client),
		socket as unknown as NotificationsSocketService,
	);
	const service = new InvitationService(
		new InvitationsRepository(client),
		notifications,
		mails as unknown as MailsService,
		'https://frontend.example.com/trello',
	);
	const invite = (email = 'recipient@example.com', role?: string) =>
		scope === 'project'
			? service.inviteUserToProject(targetId, 'actor', email, role)
			: service.inviteUserToBoard(targetId, 'actor', email, role);
	const link = (role?: string) =>
		scope === 'project'
			? service.createShareLinkForProject(targetId, 'actor', role)
			: service.createShareLinkForBoard(targetId, 'actor', role);
	return {
		service,
		invite,
		link,
		client,
		root,
		socket,
		mails,
		events,
		failures,
		users,
		roles,
		allowed,
		admins,
		board,
		project,
		scope,
		targetId,
		roleId,
		state: () => state,
	};
}
