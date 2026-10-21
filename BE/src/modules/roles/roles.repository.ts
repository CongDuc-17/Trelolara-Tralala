import { RoleStatusEnum } from '@prisma/client';

import { DatabaseClient, prisma } from '../database';

export class RolesRepository {
	constructor(private readonly prismaService: DatabaseClient = prisma) {}
	async findRoleIdByUserId(userId: string) {
		const userRole = await this.prismaService.usersRoles.findFirst({
			where: { userId, role: { deletedAt: null, status: RoleStatusEnum.ACTIVE } },
			select: { roleId: true },
		});
		return userRole?.roleId;
	}
	async findByName(roleName: string) {
		return this.prismaService.roles.findFirst({
			where: { name: roleName, deletedAt: null, status: RoleStatusEnum.ACTIVE },
		});
	}

	async findById(roleId: string) {
		return this.prismaService.roles.findUnique({
			where: { id: roleId, deletedAt: null },
		});
	}

	async getAllRoles() {
		return this.prismaService.roles.findMany({
			where: { deletedAt: null },
		});
	}
}
