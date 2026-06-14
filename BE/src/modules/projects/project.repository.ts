import { projectMembers } from './../../models/modelSchema/projectMembersSchema';
import { Prisma, ProjectStatusEnum, UserStatusEnum } from '@prisma/client';

import { PrismaService } from '../database';

import { projects } from '@/models';
import { BoardsRepository } from '../boards/boards.repository';

export class ProjectsRepository {
	constructor(
		private readonly prismaService = new PrismaService(),
		private readonly boardsRepository = new BoardsRepository(),
	) {}

	async createProject(
		name: string,
		description?: string,
		background?: string,
	): Promise<projects> {
		return this.prismaService.projects.create({
			data: {
				name,
				description,
				background,
			},
		});
	}

	async getProjectById(projectId: string) {
		return this.prismaService.projects.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				description: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				_count: {
					select: {
						members: true,
						boards: true,
					},
				},
			},
		});
	}

	async updateProject(projectId: string, data: Prisma.projectsUpdateInput) {
		return this.prismaService.projects.update({
			where: { id: projectId },
			data,
		});
	}

	async archiveProject(projectId: string): Promise<projects> {
		return this.prismaService.projects.update({
			where: { id: projectId },
			data: { status: ProjectStatusEnum.ARCHIVED },
		});
	}

	async restoreProject(projectId: string): Promise<projects> {
		return this.prismaService.projects.update({
			where: { id: projectId },
			data: {
				status: ProjectStatusEnum.ACTIVE,
				deletedAt: null,
			},
		});
	}

	async softDeleteProject(projectId: string): Promise<projects> {
		return this.prismaService.projects.update({
			where: { id: projectId },
			data: {
				deletedAt: new Date(),
				status: ProjectStatusEnum.DELETED,
			},
		});
	}

	async deleteProject(projectId: string): Promise<void> {
		const project = await this.prismaService.projects.findUnique({
			where: { id: projectId },
		});

		if (!project || !project.deletedAt) {
			throw new Error('Project not found or not marked for deletion');
		}

		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
		if (project.deletedAt > fifteenDaysAgo) {
			throw new Error('Project is still within 15-day grace period');
		}

		await this.prismaService.projectMembers.deleteMany({
			where: { projectId },
		});

		const boards = await this.prismaService.boards.findMany({
			where: { projectId },
			select: { id: true },
		});

		await Promise.all(
			boards.map((board) => this.boardsRepository.deleteBoard(board.id)),
		);

		await this.prismaService.projects.delete({
			where: { id: projectId },
		});
	}

	async cleanupExpiredProjects(): Promise<number> {
		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

		const expiredProjects = await this.prismaService.projects.findMany({
			where: {
				deletedAt: { lt: fifteenDaysAgo },
			},
			select: { id: true },
		});

		let deleteCount = 0;

		for (const project of expiredProjects) {
			try {
				await this.deleteProject(project.id);
				deleteCount++;
			} catch (error) {
				console.error(
					`[ProjectsRepository] Failed to delete project ${project.id}:`,
					error,
				);
			}
		}

		return deleteCount;
	}
}
