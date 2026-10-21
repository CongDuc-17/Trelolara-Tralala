import { DatabaseClient, prisma, runInTransaction } from './index';
import {
	BUILTIN_PERMISSION_NAMES,
	BUILTIN_ROLE_PERMISSIONS,
} from '../roles/builtin-role-permissions';

export async function seedBuiltInRoles(client?: DatabaseClient): Promise<void> {
	await runInTransaction(async (transaction) => {
		for (const name of Object.keys(BUILTIN_ROLE_PERMISSIONS)) {
			await transaction.roles.upsert({
				where: { name },
				create: { name, description: `Role ${name}` },
				update: {},
			});
		}
		for (const name of BUILTIN_PERMISSION_NAMES) {
			await transaction.permissions.upsert({
				where: { name },
				create: { name, description: `Permission ${name}` },
				update: {},
			});
		}

		const roles = await transaction.roles.findMany({
			where: { name: { in: Object.keys(BUILTIN_ROLE_PERMISSIONS) } },
			select: { id: true, name: true },
		});
		const permissions = await transaction.permissions.findMany({
			where: { name: { in: BUILTIN_PERMISSION_NAMES } },
			select: { id: true, name: true },
		});
		const permissionIds = new Map(
			permissions.map((permission) => [permission.name, permission.id]),
		);
		const builtInPermissionIds = permissions.map((permission) => permission.id);

		if (
			roles.length !== Object.keys(BUILTIN_ROLE_PERMISSIONS).length ||
			permissions.length !== BUILTIN_PERMISSION_NAMES.length
		) {
			throw new Error(
				'Built-in role or permission records are missing after seeding',
			);
		}

		for (const role of roles) {
			const desiredIds = [...new Set(BUILTIN_ROLE_PERMISSIONS[role.name])].map(
				(name) => {
					const id = permissionIds.get(name);
					if (!id) throw new Error(`Missing built-in permission: ${name}`);
					return id;
				},
			);
			// Reconcile managed grants without changing custom roles or custom permissions.
			await transaction.rolesPermissions.deleteMany({
				where: {
					roleId: role.id,
					permissionId: { in: builtInPermissionIds, notIn: desiredIds },
				},
			});
			await transaction.rolesPermissions.createMany({
				data: desiredIds.map((permissionId) => ({
					roleId: role.id,
					permissionId,
				})),
				skipDuplicates: true,
			});
		}
	}, client);
}

async function main(): Promise<void> {
	try {
		await seedBuiltInRoles();
		console.log('Built-in roles and permissions reconciled successfully');
	} catch (error) {
		console.error('Role and permission seed failed:', error);
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	void main().catch((error) => {
		console.error('Seed shutdown failed:', error);
		process.exitCode = 1;
	});
}
