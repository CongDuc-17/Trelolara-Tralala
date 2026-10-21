import { prisma, type DatabaseClient } from '@/modules/database';
import { PermissionService } from '@/modules/permissions/permission.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';

export class BoardRealtimeRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	async snapshot(userId: string, boardId: string): Promise<string | null> {
		if (
			!(await this.client.boards.findUnique({
				where: { id: boardId },
				select: { id: true },
			}))
		)
			return null;
		if (
			!(await new PermissionService(
				new PermissionsRepository(this.client),
			).hasBoardPermission(userId, boardId, ['GET_BOARD']))
		)
			return null;
		const change = await this.client.boardChanges.findUnique({ where: { boardId } });
		return (change?.revision ?? BigInt(0)).toString();
	}
}
