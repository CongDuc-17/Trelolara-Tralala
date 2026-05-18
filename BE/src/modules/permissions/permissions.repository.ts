import { permissions } from './../../models/modelSchema/permissionsSchema';
import { RoleStatusEnum } from '@prisma/client';
import { PrismaService } from '../database';

export class PermissionsRepository {
	constructor(private readonly prismaService = new PrismaService()) {}
	/**
	 * Kiểm tra user có các permissions được yêu cầu hay không
	 * @param userId - ID của user cần kiểm tra
	 * @param permissions - Danh sách tên permissions cần check (VD: ['GET_USER', 'CREATE_PROJECT'])
	 * @returns true nếu user có ít nhất 1 permission trong danh sách, false nếu không
	 *
	 * Logic: Query qua usersRoles -> roles -> rolesPermissions -> permissions
	 */
	async hasSystemPermission(userId: string, permissions: string[]): Promise<Boolean> {
		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { id: true },
		});
		if (!user) {
			return false;
		}

		const userPermissions = await this.prismaService.rolesPermissions.findMany({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,
					usersRoles: {
						some: { userId: userId },
					},
				},
			},
			select: { id: true },
		});
		console.log('User permissions:', userPermissions);

		return userPermissions.length > 0;
	}

	async hasPermission(userId: string, permissions: string[]): Promise<boolean> {
		const user = await this.prismaService.users.findUnique({
			where: { id: userId },
			select: { id: true },
		});
		if (!user) {
			return false;
		}

		const userPermission = await this.prismaService.rolesPermissions.findFirst({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				OR: [
					{
						role: {
							deletedAt: null,
							usersRoles: { some: { userId: userId } },
						},
					},
					{
						role: {
							deletedAt: null,
							projectMembers: { some: { userId: userId } },
						},
					},
					{
						role: {
							deletedAt: null,
							boardMembers: { some: { userId: userId } },
						},
					},
				],
			},
			select: { id: true },
		});

		console.log('User permission:', userPermission, 'permissions:', permissions);
		return !!userPermission;
	}

	// permissions.repository.ts
	async hasBoardPermission(
		userId: string,
		boardId: string,
		permissions: string[],
	): Promise<boolean> {
		const count = await this.prismaService.rolesPermissions.count({
			where: {
				permission: {
					name: { in: permissions },
					deletedAt: null,
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,

					boardMembers: {
						some: {
							userId: userId,
							boardId: boardId,
						},
					},
				},
			},
		});
		return count > 0;
	}

	// permissions.repository.ts
	async hasProjectPermission(
		userId: string,
		projectId: string,
		permissions: string[],
	): Promise<boolean> {
		const count = await this.prismaService.rolesPermissions.count({
			where: {
				permission: { name: { in: permissions } },
				role: {
					projectMembers: {
						some: {
							userId: userId,
							projectId: projectId,
						},
					},
				},
			},
		});
		return count > 0;
	}
	//nên chia ra làm 3 quyền, hệ thống, project, board
	// project và board thì nên check trong service luôn

	//refactor

	/**
	 * 1. CHECK QUYỀN HỆ THỐNG (SYSTEM LEVEL)
	 * - Dùng cho: Admin operations, User management
	 * - Flow: users -> usersRoles -> roles -> rolesPermissions -> permissions
	 */
	async checkSystemPermission(userId: string, permissions: string[]): Promise<boolean> {
		const hasPerm = await this.prismaService.rolesPermissions.count({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,
					usersRoles: {
						some: { userId: userId },
					},
				},
			},
		});
		return hasPerm > 0;
	}

	/**
	 * 2. CHECK QUYỀN PROJECT CỤ THỂ
	 * - Dùng cho: Project operations
	 * - Flow: users -> projectMembers -> roles -> rolesPermissions -> permissions
	 */

	async checkProjectPermission(
		userId: string,
		projectId: string,
		permissions: string[],
	): Promise<boolean> {
		const count = await this.prismaService.rolesPermissions.count({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,
					projectMembers: {
						some: {
							userId: userId,
							projectId: projectId,
							//accepted: true,
						},
					},
				},
			},
		});

		console.log('Project permission count:', count);

		const permissionNames = await this.prismaService.rolesPermissions.findMany({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,
					projectMembers: {
						some: {
							userId: userId,
							projectId: projectId,
							// accepted: true,
						},
					},
				},
			},
			select: {
				permission: {
					select: {
						name: true,
					},
				},
			},
		});

		console.log(
			'Project permission names:',
			permissionNames.map((p) => p.permission.name),
		);
		return count > 0;
	}

	/**
	 * 3. CHECK QUYỀN BOARD CỤ THỂ
	 * - Dùng cho: Board operations
	 * - Flow: users -> boardMembers -> roles -> rolesPermissions -> permissions
	 */

	async checkBoardPermission(
		userId: string,
		boardId: string,
		permissions: string[],
	): Promise<boolean> {
		const count = await this.prismaService.rolesPermissions.count({
			where: {
				permission: {
					deletedAt: null,
					name: { in: permissions },
				},
				role: {
					deletedAt: null,
					status: RoleStatusEnum.ACTIVE,
					boardMembers: {
						some: {
							userId: userId,
							boardId: boardId,
							// accepted: true,
						},
					},
				},
			},
		});
		return count > 0;
	}

	/**
	 * 4. CHECK QUYỀN BOARD VỚI INHERITANCE TỪ PROJECT
	 * - Logic: Check board permission HOẶC project permission
	 * - Vì project admin nên có quyền trên boards thuộc project đó
	 */
	async checkBoardPermissionWithInheritance(
		userId: string,
		boardId: string,
		permissions: string[],
	): Promise<boolean> {
		// Lấy projectId từ boardId
		const board = await this.prismaService.boards.findUnique({
			where: { id: boardId },
			select: { projectId: true },
		});

		if (!board) return false;

		// Check board permission trực tiếp
		const hasBoardPerm = await this.checkBoardPermission(
			userId,
			boardId,
			permissions,
		);
		if (hasBoardPerm) return true;

		// Nếu không có board permission, check project permission
		const hasProjectPerm = await this.checkProjectPermission(
			userId,
			board.projectId,
			permissions,
		);
		return hasProjectPerm;
	}

	/**
	 * 5. CHECK MULTI-LEVEL (LINH HOẠT)
	 * - Dùng khi cần check quyền ở nhiều cấp độ
	 */
	async checkAnyPermission(
		userId: string,
		permissions: string[],
		context?: {
			projectId?: string;
			boardId?: string;
		},
	): Promise<boolean> {
		// 1. Check system level first (nếu là admin thì có mọi quyền)
		const hasSystemPerm = await this.checkSystemPermission(userId, permissions);
		if (hasSystemPerm) return true;

		// 2. Check project level nếu có projectId
		if (context?.projectId) {
			const hasProjectPerm = await this.checkProjectPermission(
				userId,
				context.projectId,
				permissions,
			);
			if (hasProjectPerm) return true;
		}

		// 3. Check board level nếu có boardId
		if (context?.boardId) {
			const hasBoardPerm = await this.checkBoardPermissionWithInheritance(
				userId,
				context.boardId,
				permissions,
			);
			if (hasBoardPerm) return true;
		}

		return false;
	}
}
