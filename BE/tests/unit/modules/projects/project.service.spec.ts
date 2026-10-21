import { ProjectsRepository } from '@/modules/projects/project.repository';
import { ProjectsService } from '@/modules/projects/project.service';
import { ProjectMembersRepository } from '@/modules/projectMembers/projectMember.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { DatabaseClient } from '@/modules/database';

const now = new Date('2026-10-21T00:00:00Z');
const roles = new Map([
	['admin', { id: 'admin', name: 'PROJECT_ADMIN', status: 'ACTIVE', deletedAt: null }],
	[
		'member',
		{ id: 'member', name: 'PROJECT_MEMBER', status: 'ACTIVE', deletedAt: null },
	],
	[
		'board-role',
		{ id: 'board-role', name: 'BOARD_MEMBER', status: 'ACTIVE', deletedAt: null },
	],
	[
		'inactive',
		{ id: 'inactive', name: 'PROJECT_CUSTOM', status: 'INACTIVE', deletedAt: null },
	],
]);

// Every adapter is an in-memory double; importing the shared Prisma client never connects it.
function setup(
	options: {
		admins?: string[];
		status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
		deletedAt?: Date;
		failMembership?: boolean;
	} = {},
) {
	type State = {
		exists: boolean;
		name: string;
		description: string | null;
		status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
		deletedAt: Date | null;
		members: Map<string, string>;
	};
	let state: State = {
		exists: true,
		name: 'Project',
		description: null,
		status: options.status ?? 'ACTIVE',
		deletedAt: options.deletedAt ?? (options.status === 'DELETED' ? now : null),
		members: new Map(
			(options.admins ?? ['admin-user']).map((userId) => [userId, 'admin']),
		),
	};
	state.members.set('member-user', 'member');
	const events: string[] = [];
	let pendingLock = Promise.resolve();
	const client = {
		$transaction: jest.fn(async (work: (tx: DatabaseClient) => Promise<unknown>) => {
			let draft: State | undefined;
			let unlock: (() => void) | undefined;
			const current = () =>
				(draft ??= { ...state, members: new Map(state.members) });
			const tx = {
				$queryRaw: jest.fn(async () => {
					const previous = pendingLock;
					pendingLock = new Promise<void>((resolve) => {
						unlock = resolve;
					});
					await previous;
					events.push('lock');
				}),
				projects: {
					findUnique: jest.fn(async () => {
						events.push('project:read');
						const value = current();
						return value.exists
							? {
									id: 'project',
									name: value.name,
									description: value.description,
									status: value.status,
									deletedAt: value.deletedAt,
									createdAt: now,
									updatedAt: now,
									_count: { members: value.members.size, boards: 0 },
								}
							: null;
					}),
					create: jest.fn(
						async ({
							data,
						}: {
							data: { name: string; description?: string };
						}) => {
							events.push('project:create');
							const value = current();
							value.exists = true;
							value.name = data.name;
							value.description = data.description ?? null;
							return {
								id: 'created',
								name: value.name,
								description: value.description,
								status: 'ACTIVE',
								createdAt: now,
								updatedAt: now,
							};
						},
					),
					update: jest.fn(async ({ data }: { data: Partial<State> }) => {
						events.push('project:update');
						Object.assign(current(), data);
						return {
							id: 'project',
							...current(),
							createdAt: now,
							updatedAt: now,
						};
					}),
				},
				roles: {
					findFirst: jest.fn(async () => roles.get('admin')),
					findUnique: jest.fn(
						async ({ where }: { where: { id: string } }) =>
							roles.get(where.id) ?? null,
					),
				},
				usersRoles: {
					findFirst: jest.fn(
						async ({ where }: { where: { userId: string } }) =>
							where.userId === 'system-admin'
								? { id: 'system-role' }
								: null,
					),
				},
				projectMembers: {
					create: jest.fn(
						async ({
							data,
						}: {
							data: { userId: string; roleId: string };
						}) => {
							events.push('member:create');
							if (options.failMembership)
								throw new Error('membership failed');
							current().members.set(data.userId, data.roleId);
							return { id: 'membership', ...data };
						},
					),
					findFirst: jest.fn(
						async ({
							where,
						}: {
							where: { userId: string; role?: { name: string } };
						}) => {
							const roleId = current().members.get(where.userId);
							const role = roleId && roles.get(roleId);
							return role && (!where.role || role.name === where.role.name)
								? { userId: where.userId, roleId, role, accepted: false }
								: null;
						},
					),
					count: jest.fn(async () => {
						events.push('admin:count');
						return [...current().members.values()].filter(
							(roleId) => roleId === 'admin',
						).length;
					}),
					deleteMany: jest.fn(
						async ({ where }: { where: { userId: string } }) => {
							events.push('member:remove');
							current().members.delete(where.userId);
							return { count: 1 };
						},
					),
					updateMany: jest.fn(
						async ({
							where,
							data,
						}: {
							where: { userId: string };
							data: { roleId: string };
						}) => {
							events.push('member:role');
							current().members.set(where.userId, data.roleId);
							return { count: 1 };
						},
					),
				},
			} as unknown as DatabaseClient;
			try {
				const result = await work(tx);
				if (draft) state = draft;
				events.push('commit');
				return result;
			} catch (error) {
				events.push('rollback');
				throw error;
			} finally {
				unlock?.();
			}
		}),
	};
	const database = client as unknown as DatabaseClient;
	const service = new ProjectsService(
		new ProjectsRepository(database),
		new ProjectMembersRepository(database),
		new RolesRepository(database),
	);
	return { service, events, state: () => state };
}

describe('project transactions and lifecycle', () => {
	it('blocks writes to legacy active rows already marked deleted', async () => {
		const test = setup({ deletedAt: now });
		await expect(
			test.service.updateProject('project', { name: 'Edit' }),
		).rejects.toMatchObject({ status: 409 });
		expect(test.state().name).toBe('Project');
	});
	it('creates the project and creator admin in the same transaction', async () => {
		const test = setup();
		await expect(
			test.service.createProject({ name: 'Created' }, 'creator'),
		).resolves.toEqual({
			id: 'created',
			name: 'Created',
			description: undefined,
			status: 'ACTIVE',
			createdAt: now,
			updatedAt: now,
			membersCount: 1,
			boardsCount: 0,
		});
		expect(test.events).toEqual(['project:create', 'member:create', 'commit']);
		expect(test.state().members.get('creator')).toBe('admin');
	});
	it('rolls back project creation if creator membership fails', async () => {
		const test = setup({ failMembership: true });
		await expect(
			test.service.createProject({ name: 'Created' }, 'creator'),
		).rejects.toThrow('membership failed');
		expect(test.state().name).toBe('Project');
		expect(test.state().members.has('creator')).toBe(false);
	});
	it.each(['ARCHIVED', 'DELETED'] as const)(
		'blocks edits, archive and member changes while %s',
		async (status) => {
			const test = setup({ status });
			for (const operation of [
				() => test.service.updateProject('project', { name: 'Edit' }),
				() => test.service.archiveProject('project'),
				() =>
					test.service.changeMemberRole(
						'project',
						'member-user',
						'admin',
						'admin-user',
					),
				() => test.service.removeMember('project', 'member-user', 'admin-user'),
			]) {
				await expect(operation()).rejects.toMatchObject({ status: 409 });
			}
			expect(test.state().name).toBe('Project');
			expect(test.state().members.has('member-user')).toBe(true);
		},
	);
	it('locks before checking lifecycle and leaves board/member records untouched on archive and restore', async () => {
		const test = setup();
		await test.service.archiveProject('project');
		expect(test.events.slice(0, 2)).toEqual(['lock', 'project:read']);
		expect(test.state().status).toBe('ARCHIVED');
		expect(test.state().members.size).toBe(2);
		await test.service.restoreProject('project');
		expect(test.state().status).toBe('ACTIVE');
	});
	it('preserves the deletion timestamp when DELETE is retried', async () => {
		const test = setup({ status: 'DELETED' });
		await test.service.softDeleteProject('project');
		expect(test.state().deletedAt).toBe(now);
		expect(test.events).not.toContain('project:update');
	});
	it('whitelists update input and preserves empty descriptions', async () => {
		const test = setup();
		await test.service.updateProject('project', {
			description: '',
			status: 'DELETED',
		} as { description: string });
		expect(test.state().description).toBe('');
		expect(test.state().status).toBe('ACTIVE');
	});
});

describe('project member admin invariants', () => {
	it.each(['remove', 'demote'] as const)(
		'protects the last admin on %s',
		async (operation) => {
			const test = setup();
			await expect(
				operation === 'remove'
					? test.service.removeMember('project', 'admin-user', 'admin-user')
					: test.service.changeMemberRole(
							'project',
							'admin-user',
							'member',
							'admin-user',
						),
			).rejects.toMatchObject({ status: 409 });
			expect(test.state().members.get('admin-user')).toBe('admin');
		},
	);
	it.each(['remove', 'demote'] as const)(
		'serializes concurrent %s operations so one admin survives',
		async (operation) => {
			const test = setup({ admins: ['admin-a', 'admin-b'] });
			const results = await Promise.allSettled(
				['admin-a', 'admin-b'].map((target) =>
					operation === 'remove'
						? test.service.removeMember('project', target, 'system-admin')
						: test.service.changeMemberRole(
								'project',
								target,
								'member',
								'system-admin',
							),
				),
			);
			expect(
				results.filter((result) => result.status === 'fulfilled'),
			).toHaveLength(1);
			expect(
				[...test.state().members.values()].filter((role) => role === 'admin'),
			).toHaveLength(1);
			expect(test.events[0]).toBe('lock');
		},
	);
	it('requires a real admin to grant, demote or remove an admin', async () => {
		const test = setup({ admins: ['admin-a', 'admin-b'] });
		await expect(
			test.service.changeMemberRole(
				'project',
				'member-user',
				'admin',
				'member-user',
			),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			test.service.changeMemberRole('project', 'admin-a', 'member', 'member-user'),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			test.service.removeMember('project', 'admin-a', 'member-user'),
		).rejects.toMatchObject({ status: 403 });
	});
	it('accepts legacy accepted=false memberships and allows admin promotion by system admin', async () => {
		const test = setup();
		await test.service.changeMemberRole(
			'project',
			'member-user',
			'admin',
			'system-admin',
		);
		expect(test.state().members.get('member-user')).toBe('admin');
	});
	it.each(['board-role', 'inactive', 'missing'])(
		'rejects invalid role %s before writing',
		async (roleId) => {
			const test = setup();
			await expect(
				test.service.changeMemberRole(
					'project',
					'member-user',
					roleId,
					'admin-user',
				),
			).rejects.toBeDefined();
			expect(test.events).not.toContain('member:role');
		},
	);
	it('removes only the project membership, without deleting independent board memberships', async () => {
		const test = setup();
		await test.service.removeMember('project', 'member-user', 'admin-user');
		expect(test.events).toEqual(['lock', 'project:read', 'member:remove', 'commit']);
	});
});
