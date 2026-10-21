import { ProjectStatusEnum } from '@prisma/client';

import { OptionalException } from '@/common/exceptions';
import { deleteBoardTree } from '../boards/board-deletion';
import { prisma, runInTransaction, type DatabaseClient } from '../database';
import { ProjectInput } from './projects.types';

const GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000;

export class ProjectsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}

	inTransaction<T>(
		work: (repository: ProjectsRepository, client: DatabaseClient) => Promise<T>,
	): Promise<T> {
		return runInTransaction(
			(client) => work(new ProjectsRepository(client), client),
			this.client,
		);
	}

	async lockProject(projectId: string): Promise<void> {
		await this.client
			.$queryRaw`SELECT id FROM "Projects" WHERE id = ${projectId} FOR UPDATE`;
	}

	createProject(name: string, description?: string) {
		return this.client.projects.create({ data: { name, description } });
	}

	getProjectById(projectId: string) {
		return this.client.projects.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				description: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				deletedAt: true,
				_count: { select: { members: true, boards: true } },
			},
		});
	}

	updateProject(projectId: string, data: Partial<ProjectInput>) {
		return this.client.projects.update({ where: { id: projectId }, data });
	}

	archiveProject(projectId: string) {
		return this.client.projects.update({
			where: { id: projectId },
			data: { status: ProjectStatusEnum.ARCHIVED },
		});
	}

	restoreProject(projectId: string) {
		return this.client.projects.update({
			where: { id: projectId },
			data: { status: ProjectStatusEnum.ACTIVE, deletedAt: null },
		});
	}

	softDeleteProject(projectId: string) {
		return this.client.projects.update({
			where: { id: projectId },
			data: { status: ProjectStatusEnum.DELETED, deletedAt: new Date() },
		});
	}

	async deleteProject(projectId: string, now = new Date()): Promise<void> {
		await this.inTransaction(async (repository, client) => {
			await repository.lockProject(projectId);
			const project = await repository.getProjectById(projectId);
			if (
				!project ||
				project.status !== ProjectStatusEnum.DELETED ||
				!project.deletedAt
			) {
				throw new OptionalException(400, 'Project is not marked for deletion');
			}
			if (project.deletedAt.getTime() > now.getTime() - GRACE_PERIOD_MS) {
				throw new OptionalException(
					400,
					'Project is still within 15-day grace period',
				);
			}
			const boards = await client.boards.findMany({
				where: { projectId },
				select: { id: true },
				orderBy: { id: 'asc' },
			});
			for (const board of boards) await deleteBoardTree(client, board.id);
			await client.invitations.deleteMany({ where: { projectId } });
			await client.projectMembers.deleteMany({ where: { projectId } });
			await client.projects.delete({ where: { id: projectId } });
		});
	}

	async cleanupExpiredProjects(now = new Date()): Promise<number> {
		const expiredProjects = await this.client.projects.findMany({
			where: {
				status: ProjectStatusEnum.DELETED,
				deletedAt: { lte: new Date(now.getTime() - GRACE_PERIOD_MS) },
			},
			select: { id: true },
			orderBy: { id: 'asc' },
		});
		let count = 0;
		for (const project of expiredProjects) {
			try {
				await this.deleteProject(project.id, now);
				count++;
			} catch {
				console.error('[Projects] Project purge failed');
			}
		}
		return count;
	}
}
