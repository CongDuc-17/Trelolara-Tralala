import { DatabaseClient, prisma } from '../database';

export class UserRoleRepository {
	constructor(private readonly prismaService: DatabaseClient = prisma) {}
	async assignUserRole(userId: string, roleId: string) {
		return this.prismaService.usersRoles.upsert({
			where: { userId_roleId: { userId, roleId } },
			create: {
				userId,
				roleId,
			},
			update: {},
		});
	}
}
