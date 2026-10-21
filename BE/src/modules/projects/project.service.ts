import {
	ForbiddenException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import { ProjectRoleEnum } from '@/common/enums/roles';
import { DatabaseClient } from '../database';
import { ProjectMembersRepository } from '../projectMembers/projectMember.repository';
import { RolesRepository } from '../roles/roles.repository';
import { ProjectsRepository } from './project.repository';
import {
	ProjectDetails,
	ProjectInput,
	ProjectMemberSummary,
	ProjectPage,
	ProjectPagination,
	ProjectStatus,
	ProjectSummary,
} from './projects.types';

export class ProjectsService {
	constructor(
		private readonly projectsRepository = new ProjectsRepository(),
		private readonly projectMembersRepository = new ProjectMembersRepository(),
		private readonly rolesRepository = new RolesRepository(),
	) {}

	async createProject(input: ProjectInput, userId: string): Promise<ProjectDetails> {
		return this.projectsRepository.inTransaction(async (repository, client) => {
			const role = await this.rolesRepository.findByName(
				ProjectRoleEnum.PROJECT_ADMIN,
				client,
			);
			if (!role) throw new NotFoundException('Project admin role not found');
			const project = await repository.createProject(input.name, input.description);
			await this.projectMembersRepository.assignUserRoleProject(
				project.id,
				userId,
				role.id,
				client,
			);
			return this.projectDetails(project, { membersCount: 1, boardsCount: 0 });
		});
	}

	async getAllProjects(
		userId: string,
		filter: { status?: ProjectStatus },
		pagination: ProjectPagination,
	): Promise<ProjectPage<ProjectSummary>> {
		const { page, limit } = pagination;
		const [memberships, totalItems] =
			await this.projectMembersRepository.getProjectsOfUser({
				userId,
				status: filter.status,
				skip: (page - 1) * limit,
				take: limit,
			});
		return {
			items: memberships.map(({ project, role }) => ({
				id: project.id,
				name: project.name,
				description: project.description ?? undefined,
				status: project.status,
				roleId: role.id,
				roleName: role.name,
				membersCount: project._count.members,
				boardsCount: project._count.boards,
			})),
			totalItems,
			page,
			limit,
		};
	}

	async getProjectById(projectId: string): Promise<ProjectDetails> {
		const project = await this.requireProject(this.projectsRepository, projectId);
		return this.projectDetails(project, {
			membersCount: project._count.members,
			boardsCount: project._count.boards,
		});
	}

	async updateProject(
		projectId: string,
		input: Partial<ProjectInput>,
	): Promise<ProjectDetails> {
		return this.projectsRepository.inTransaction(async (repository) => {
			await repository.lockProject(projectId);
			const project = await this.requireActiveProject(repository, projectId);
			const data: Partial<ProjectInput> = {};
			if (input.name !== undefined && input.name !== project.name)
				data.name = input.name;
			if (
				input.description !== undefined &&
				input.description !== project.description
			)
				data.description = input.description;
			if (!Object.keys(data).length)
				return this.projectDetails(project, {
					membersCount: project._count.members,
					boardsCount: project._count.boards,
				});
			const updated = await repository.updateProject(projectId, data);
			return this.projectDetails(updated);
		});
	}

	async archiveProject(projectId: string): Promise<void> {
		await this.projectsRepository.inTransaction(async (repository) => {
			await repository.lockProject(projectId);
			await this.requireActiveProject(repository, projectId);
			await repository.archiveProject(projectId);
		});
	}

	async restoreProject(projectId: string): Promise<void> {
		await this.projectsRepository.inTransaction(async (repository) => {
			await repository.lockProject(projectId);
			const project = await this.requireProject(repository, projectId);
			if (project.status !== 'ARCHIVED')
				throw new OptionalException(400, 'Only archived project can be restored');
			await repository.restoreProject(projectId);
		});
	}

	async softDeleteProject(projectId: string): Promise<void> {
		await this.projectsRepository.inTransaction(async (repository) => {
			await repository.lockProject(projectId);
			const project = await this.requireProject(repository, projectId);
			// Repeated deletion must not extend the purge grace period.
			if (project.status !== 'DELETED')
				await repository.softDeleteProject(projectId);
		});
	}

	async getProjectMembers(
		projectId: string,
		pagination: ProjectPagination,
	): Promise<ProjectPage<ProjectMemberSummary>> {
		await this.requireProject(this.projectsRepository, projectId);
		const { page, limit } = pagination;
		const [members, totalItems] =
			await this.projectMembersRepository.getProjectMembers({
				projectId,
				skip: (page - 1) * limit,
				take: limit,
			});
		return {
			items: members.map((member) => ({
				projectId: member.projectId,
				id: member.user.id,
				name: member.user.name,
				email: member.user.email,
				avatar: member.user.avatar,
				acceptedAt: member.accepted ? member.invitedAt : null,
				invitedAt: member.invitedAt,
				roleId: member.role.id,
				roleName: member.role.name,
			})),
			totalItems,
			page,
			limit,
		};
	}

	async changeMemberRole(
		projectId: string,
		userId: string,
		newRoleId: string,
		actorId: string,
	): Promise<void> {
		await this.projectsRepository.inTransaction(async (repository, client) => {
			await repository.lockProject(projectId);
			await this.requireActiveProject(repository, projectId);
			const role = await this.rolesRepository.findById(newRoleId, client);
			if (!role) throw new NotFoundException('Role not found');
			if (role.status !== 'ACTIVE')
				throw new OptionalException(400, 'Role is inactive');
			if (!role.name.startsWith('PROJECT_'))
				throw new OptionalException(
					400,
					'Role must be a project role (PROJECT_*)',
				);
			const member = await this.requireMember(projectId, userId, client);
			if (
				member.role.name === ProjectRoleEnum.PROJECT_ADMIN ||
				role.name === ProjectRoleEnum.PROJECT_ADMIN
			) {
				await this.requireAdminActor(projectId, actorId, client);
			}
			if (
				member.role.name === ProjectRoleEnum.PROJECT_ADMIN &&
				role.name !== ProjectRoleEnum.PROJECT_ADMIN
			) {
				await this.protectLastAdmin(projectId, client);
			}
			await this.projectMembersRepository.changeRoleOfMemberProject(
				projectId,
				userId,
				role.id,
				client,
			);
		});
	}

	async removeMember(
		projectId: string,
		userId: string,
		actorId: string,
	): Promise<void> {
		await this.projectsRepository.inTransaction(async (repository, client) => {
			await repository.lockProject(projectId);
			await this.requireActiveProject(repository, projectId);
			const member = await this.requireMember(projectId, userId, client);
			if (member.role.name === ProjectRoleEnum.PROJECT_ADMIN) {
				await this.requireAdminActor(projectId, actorId, client);
				await this.protectLastAdmin(projectId, client);
			}
			await this.projectMembersRepository.removeMember(projectId, userId, client);
		});
	}

	private async requireProject(repository: ProjectsRepository, projectId: string) {
		const project = await repository.getProjectById(projectId);
		if (!project) throw new NotFoundException('Project not found');
		return project;
	}

	private async requireActiveProject(
		repository: ProjectsRepository,
		projectId: string,
	) {
		const project = await this.requireProject(repository, projectId);
		if (project.status !== 'ACTIVE' || project.deletedAt)
			throw new OptionalException(409, 'Project is read-only');
		return project;
	}

	private async requireMember(
		projectId: string,
		userId: string,
		client: DatabaseClient,
	) {
		const member = await this.projectMembersRepository.isUserMemberOfProject(
			projectId,
			userId,
			client,
		);
		if (!member) throw new NotFoundException('Project member not found');
		return member;
	}

	private async requireAdminActor(
		projectId: string,
		actorId: string,
		client: DatabaseClient,
	): Promise<void> {
		if (
			!(await this.projectMembersRepository.isActiveAdmin(
				projectId,
				actorId,
				client,
			))
		)
			throw new ForbiddenException();
	}

	private async protectLastAdmin(
		projectId: string,
		client: DatabaseClient,
	): Promise<void> {
		if ((await this.projectMembersRepository.countAdmins(projectId, client)) <= 1)
			throw new OptionalException(409, 'Project must retain at least one admin');
	}

	private projectDetails(
		project: {
			id: string;
			name: string;
			description: string | null;
			status: ProjectStatus;
			createdAt: Date;
			updatedAt: Date;
		},
		counts: { membersCount?: number; boardsCount?: number } = {},
	): ProjectDetails {
		return {
			id: project.id,
			name: project.name,
			description: project.description ?? undefined,
			status: project.status,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			...counts,
		};
	}
}
