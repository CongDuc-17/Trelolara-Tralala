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
				orderBy: {
					project: {
						createdAt: 'desc',
					},
				},
			}),
			this.prisma.projectMembers.count({
				where: { userId, project: { status } },
			}),
		]);
	}

	async assignUserRoleProject(projectId: string, userId: string, roleId: string) {
		return this.prisma.projectMembers.create({
			data: {
				projectId,
				userId,
				roleId,
			},
		});
	}

	async isUserMemberOfProject(projectId: string, userId: string) {
		const m = await this.prisma.projectMembers.findFirst({
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
				orderBy: {
					invitedAt: 'desc',
				},
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
	) {
		return this.prisma.projectMembers.updateMany({
			where: { projectId, userId },
			data: { roleId: newRoleId },
		});
	}

	async removeMember(projectId: string, userId: string) {
		return this.prisma.projectMembers.deleteMany({
			where: { projectId, userId },
		});
	}
}
