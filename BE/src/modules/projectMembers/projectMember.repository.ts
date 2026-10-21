import { ProjectStatusEnum } from '@prisma/client';
import { prisma as database, type DatabaseClient } from '../database/prisma.service';

export class ProjectMembersRepository {
	constructor(private readonly prisma: DatabaseClient = database) {}

	async getProjectsOfUser({
		userId,
		status,
		skip,
		take,
	}: {
		userId: string;
		status?: ProjectStatusEnum;
		skip: number;
		take: number;
	}) {
		return Promise.all([
			this.prisma.projectMembers.findMany({
				where: { userId, project: { status } },
				skip: skip,
				take: take,
				select: {
					id: true,
					projectId: true,
					role: {
						select: {
							id: true,
							name: true,
						},
					},
					project: {
						select: {
							id: true,
							name: true,
							description: true,
							status: true,

							_count: {
								select: {
									boards: true,
									members: true,
								},
							},
						},
					},
				},
				orderBy: [{ project: { createdAt: 'desc' } }, { id: 'asc' }],
			}),
			this.prisma.projectMembers.count({
				where: { userId, project: { status } },
			}),
		]);
	}

	async assignUserRoleProject(
		projectId: string,
		userId: string,
		roleId: string,
		client: DatabaseClient = this.prisma,
	) {
		return client.projectMembers.create({
			data: {
				projectId,
				userId,
				roleId,
			},
		});
	}

	async isUserMemberOfProject(
		projectId: string,
		userId: string,
		client: DatabaseClient = this.prisma,
	) {
		const m = await client.projectMembers.findFirst({
			where: { projectId, userId },
			include: {
				role: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});
		return m;
	}
	async getProjectMembers({
		projectId,
		skip,
		take,
	}: {
		projectId: string;
		skip: number;
		take: number;
	}) {
		return Promise.all([
			this.prisma.projectMembers.findMany({
				where: {
					projectId,
				},
				skip: skip,
				take: take,
				select: {
					id: true,
					userId: true,
					projectId: true,
					accepted: true,
					invitedAt: true,
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							avatar: true,
						},
					},
					role: {
						select: {
							id: true,
							name: true,
						},
					},
				},
				orderBy: [{ invitedAt: 'desc' }, { id: 'asc' }],
			}),
			this.prisma.projectMembers.count({
				where: {
					projectId,
				},
			}),
		]);
	}

	async changeRoleOfMemberProject(
		projectId: string,
		userId: string,
		newRoleId: string,
		client: DatabaseClient = this.prisma,
	) {
		return client.projectMembers.updateMany({
			where: { projectId, userId },
			data: { roleId: newRoleId },
		});
	}

	async removeMember(
		projectId: string,
		userId: string,
		client: DatabaseClient = this.prisma,
	) {
		return client.projectMembers.deleteMany({
			where: { projectId, userId },
		});
	}

	async isActiveAdmin(
		projectId: string,
		userId: string,
		client: DatabaseClient = this.prisma,
	): Promise<boolean> {
		const role = { name: 'ADMIN', status: 'ACTIVE' as const, deletedAt: null };
		if (
			await client.usersRoles.findFirst({
				where: { userId, role },
				select: { id: true },
			})
		)
			return true;
		return Boolean(
			await client.projectMembers.findFirst({
				where: { projectId, userId, role: { ...role, name: 'PROJECT_ADMIN' } },
				select: { id: true },
			}),
		);
	}

	countAdmins(
		projectId: string,
		client: DatabaseClient = this.prisma,
	): Promise<number> {
		return client.projectMembers.count({
			where: {
				projectId,
				role: { name: 'PROJECT_ADMIN', status: 'ACTIVE', deletedAt: null },
			},
		});
	}
}
