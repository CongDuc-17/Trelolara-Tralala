import type { DatabaseClient } from '@/modules/database';

jest.mock('@/modules/database', () => ({
	prisma: { $disconnect: jest.fn() },
	runInTransaction: jest.fn(
		async (
			work: (client: unknown) => Promise<void>,
			client: { $transaction: (callback: typeof work) => Promise<void> },
		) => client.$transaction(work),
	),
}));

import { prisma, runInTransaction } from '@/modules/database';
import { seedBuiltInRoles } from '@/modules/database/seed';

function createDatabase() {
	const roles = new Map([
		[
			'CUSTOM_REVIEWER',
			{
				id: 'custom-role',
				name: 'CUSTOM_REVIEWER',
				status: 'ACTIVE',
				deletedAt: null as Date | null,
			},
		],
		[
			'BOARD_VIEWER',
			{
				id: 'viewer-role',
				name: 'BOARD_VIEWER',
				status: 'INACTIVE',
				deletedAt: new Date(0),
			},
		],
	]);
	const permissions = new Map([
		['UPDATE_CARD', { id: 'write-card', name: 'UPDATE_CARD' }],
		['GET_CARD', { id: 'read-card', name: 'GET_CARD' }],
		['CUSTOM_REPORT', { id: 'custom-permission', name: 'CUSTOM_REPORT' }],
	]);
	const grants = new Map([
		['viewer-role:write-card', { roleId: 'viewer-role', permissionId: 'write-card' }],
		['custom-role:read-card', { roleId: 'custom-role', permissionId: 'read-card' }],
		[
			'viewer-role:custom-permission',
			{ roleId: 'viewer-role', permissionId: 'custom-permission' },
		],
	]);
	const transaction = {
		roles: {
			upsert: jest.fn(
				async ({
					where,
					create,
				}: {
					where: { name: string };
					create: { name: string };
				}) => {
					if (!roles.has(where.name))
						roles.set(where.name, {
							id: where.name,
							name: create.name,
							status: 'ACTIVE',
							deletedAt: null,
						});
					return roles.get(where.name);
				},
			),
			findMany: jest.fn(async ({ where }: { where: { name: { in: string[] } } }) =>
				[...roles.values()].filter((role) => where.name.in.includes(role.name)),
			),
		},
		permissions: {
			upsert: jest.fn(
				async ({
					where,
					create,
				}: {
					where: { name: string };
					create: { name: string };
				}) => {
					if (!permissions.has(where.name))
						permissions.set(where.name, {
							id: where.name,
							name: create.name,
						});
					return permissions.get(where.name);
				},
			),
			findMany: jest.fn(async ({ where }: { where: { name: { in: string[] } } }) =>
				[...permissions.values()].filter((permission) =>
					where.name.in.includes(permission.name),
				),
			),
		},
		rolesPermissions: {
			deleteMany: jest.fn(
				async ({
					where,
				}: {
					where: {
						roleId: string;
						permissionId: { in: string[]; notIn: string[] };
					};
				}) => {
					for (const [key, grant] of grants) {
						if (
							grant.roleId === where.roleId &&
							where.permissionId.in.includes(grant.permissionId) &&
							!where.permissionId.notIn.includes(grant.permissionId)
						)
							grants.delete(key);
					}
					return { count: 0 };
				},
			),
			createMany: jest.fn(
				async ({
					data,
				}: {
					data: { roleId: string; permissionId: string }[];
				}) => {
					for (const grant of data)
						grants.set(`${grant.roleId}:${grant.permissionId}`, grant);
					return { count: data.length };
				},
			),
		},
	};
	const client = {
		$transaction: jest.fn(
			async (work: (value: typeof transaction) => Promise<void>) =>
				work(transaction),
		),
	};
	return { client: client as unknown as DatabaseClient, transaction, roles, grants };
}

describe('built-in permission reconciliation', () => {
	it('has no seed or disconnect side effects when imported', () => {
		expect(runInTransaction).not.toHaveBeenCalled();
		expect(prisma.$disconnect).not.toHaveBeenCalled();
	});

	it('removes obsolete built-in grants, preserves custom data and existing disabled states, and is repeatable', async () => {
		const database = createDatabase();
		await seedBuiltInRoles(database.client);
		expect(runInTransaction).toHaveBeenCalledWith(
			expect.any(Function),
			database.client,
		);
		expect(database.grants.has('viewer-role:write-card')).toBe(false);
		expect(database.grants.has('viewer-role:read-card')).toBe(true);
		expect(database.grants.has('custom-role:read-card')).toBe(true);
		expect(database.grants.has('viewer-role:custom-permission')).toBe(true);
		expect(database.roles.get('BOARD_VIEWER')).toEqual({
			id: 'viewer-role',
			name: 'BOARD_VIEWER',
			status: 'INACTIVE',
			deletedAt: new Date(0),
		});
		expect(database.transaction.roles.upsert).not.toHaveBeenCalledWith(
			expect.objectContaining({ where: { name: 'CUSTOM_REVIEWER' } }),
		);
		const firstGrants = [...database.grants.entries()];
		await seedBuiltInRoles(database.client);
		expect([...database.grants.entries()]).toEqual(firstGrants);
	});

	it('rejects on a failed write instead of reporting a successful seed', async () => {
		const database = createDatabase();
		database.transaction.rolesPermissions.createMany.mockRejectedValueOnce(
			new Error('seed write failed'),
		);
		await expect(seedBuiltInRoles(database.client)).rejects.toThrow(
			'seed write failed',
		);
	});
});
