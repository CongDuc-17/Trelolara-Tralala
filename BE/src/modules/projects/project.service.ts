import { ProjectsRepository } from './project.repository';

import {
	HttpResponseBodySuccessDto,
	InternalServerException,
	NotFoundException,
	OptionalException,
	PaginationDto,
	PaginationUtils,
} from '@/common';
import { CreateProjectRequestDto, GetProjectsRequestDto } from './dtos/requests';
import { ProjectMembersRepository } from '../projectMembers/projectMember.repository';
import { ProjectStatusEnum, RoleStatusEnum } from '@prisma/client';
import { ProjectRoleEnum } from '@/common/enums/roles';
import { RolesRepository } from '../roles/roles.repository';
import { Forbidden } from '@/common/exceptions/app-error';
import {
	GetMembersResponseDTO,
	GetProjectResponseDTO,
	GetProjectsResponseDTO,
} from './dtos/responses';

export class ProjectsService {
	constructor(
		private readonly projectsRepository: ProjectsRepository = new ProjectsRepository(),
		private readonly projectMembersRepository: ProjectMembersRepository = new ProjectMembersRepository(),
		private readonly rolesRepository: RolesRepository = new RolesRepository(),
	) {}

	async createProject(
		createProject: CreateProjectRequestDto,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<GetProjectResponseDTO>> {
		const projectAdminRole = await this.rolesRepository.findByName(
			ProjectRoleEnum.PROJECT_ADMIN,
		);
		if (!projectAdminRole) {
			throw new NotFoundException('Project admin role not found');
		}

		const project = await this.projectsRepository.createProject(
			createProject.name,
			createProject.description,
		);
		await this.projectMembersRepository.assignUserRoleProject(
			project.id,
			userId,
			projectAdminRole.id,
		);
		return {
			success: true,
			data: new GetProjectResponseDTO({
				...project,
				description: project.description ?? undefined,
				status: project.status,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
				membersCount: 1,
				boardsCount: 0,
			}),
		};
	}

	async getAllProjects(
		userId: string,
		getProjectsRequest: GetProjectsRequestDto,
		pagination: PaginationDto,
	): Promise<HttpResponseBodySuccessDto<GetProjectsResponseDTO[]>> {
		const paginationUtils = new PaginationUtils().extractSkipTakeFromPagination(
			pagination,
		);
		const { status } = getProjectsRequest;
		const [projectsOfUser, totalProjectsOfUser] =
			await this.projectMembersRepository.getProjectsOfUser({
				userId: userId,
				status: status as ProjectStatusEnum,
				skip: paginationUtils.skip,
				take: paginationUtils.take,
			});

		const projects = projectsOfUser.map(
			(up) =>
				new GetProjectsResponseDTO({
					...up.project,
					description: up.project.description ?? undefined,
					roleId: up.role.id,
					roleName: up.role.name,
					membersCount: up.project._count.members,
					boardsCount: up.project._count.boards,
				}),
		);

		return {
			success: true,
			data: projects,
			pagination:
				paginationUtils.convertPaginationResponseDtoFromTotalRecords(
					totalProjectsOfUser,
				),
		};
	}

	async getProjectById(
		projectId: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<GetProjectResponseDTO>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const isMember = await this.projectMembersRepository.isUserMemberOfProject(
			projectId,
			userId,
		);
		if (!isMember) {
			throw new Forbidden('You are not a member of this project');
		}

		return {
			success: true,
			data: new GetProjectResponseDTO({
				...project,
				description: project.description ?? undefined,
				status: project.status,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
				membersCount: project._count.members,
				boardsCount: project._count.boards,
			}),
		};
	}

	async updateInformationProject(
		projectId: string,

		updateData: Partial<CreateProjectRequestDto>,
	): Promise<HttpResponseBodySuccessDto<GetProjectResponseDTO>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const updatePayload: any = {};

		if (updateData.name && updateData.name !== project.name) {
			updatePayload.name = updateData.name;
		}

		if (
			updateData.description !== undefined &&
			updateData.description !== project.description
		) {
			updatePayload.description = updateData.description;
		}

		if (Object.keys(updatePayload).length === 0) {
			console.log('No changes detected, skipping update.');
			return {
				success: true,
				data: new GetProjectResponseDTO({
					...project,
					description: project.description ?? undefined,
					status: project.status,
					createdAt: project.createdAt,
					updatedAt: project.updatedAt,
					membersCount: project._count.members,
					boardsCount: project._count.boards,
				}),
			};
		}

		const updatedProject = await this.projectsRepository.updateProject(
			projectId,
			updatePayload,
		);

		return {
			success: true,
			data: new GetProjectResponseDTO({
				...updatedProject,
				description: updatedProject.description ?? undefined,
				status: updatedProject.status,
				createdAt: updatedProject.createdAt,
				updatedAt: updatedProject.updatedAt,
			}),
		};
	}

	async archiveProject(projectId: string): Promise<HttpResponseBodySuccessDto<null>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		await this.projectsRepository.archiveProject(projectId);

		return {
			success: true,
			data: null,
		};
	}

	async restoreProject(projectId: string): Promise<HttpResponseBodySuccessDto<null>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}
		if (project.status !== ProjectStatusEnum.ARCHIVED) {
			throw new OptionalException(400, 'Only archived project can be restored');
		}
		await this.projectsRepository.restoreProject(projectId);

		return {
			success: true,
			data: null,
		};
	}

	async softDeleteProject(
		projectId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}
		await this.projectsRepository.softDeleteProject(projectId);

		return {
			success: true,
			data: null,
		};
	}

	async deleteProject(
		projectId: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		try {
			const project = await this.projectsRepository.getProjectById(projectId);
			if (!project) {
				throw new NotFoundException('Project not found');
			}
			const isMember = await this.projectMembersRepository.isUserMemberOfProject(
				projectId,
				userId,
			);
			if (!isMember) {
				throw new Forbidden('You are not a member of this project');
			}
			if (isMember.role.name !== ProjectRoleEnum.PROJECT_ADMIN) {
				throw new Forbidden('Only project admin can delete the project');
			}
			await this.projectsRepository.deleteProject(projectId);

			return {
				success: true,
				data: null,
			};
		} catch (error) {
			console.error('[ProjectsService] deleteProject error:', error);
			if (error instanceof NotFoundException || error instanceof Forbidden) {
				throw error;
			}
			throw new InternalServerException();
		}
	}

	async getProjectMembers(
		projectId: string,
		pagination: PaginationDto,
	): Promise<HttpResponseBodySuccessDto<GetMembersResponseDTO[]>> {
		const existingProject = await this.projectsRepository.getProjectById(projectId);
		if (!existingProject) {
			throw new NotFoundException('Project not found');
		}
		const paginationUtils = new PaginationUtils().extractSkipTakeFromPagination(
			pagination,
		);
		const [members, totalMembers] =
			await this.projectMembersRepository.getProjectMembers({
				projectId: projectId,
				skip: paginationUtils.skip,
				take: paginationUtils.take,
			});
		const membersResponse = members.map(
			(m) =>
				new GetMembersResponseDTO({
					projectId: m.projectId,
					id: m.user.id,
					name: m.user.name,
					email: m.user.email,
					avatar: m.user.avatar,
					acceptedAt: m.accepted ? m.invitedAt : null,
					invitedAt: m.invitedAt,
					roleId: m.role.id,
					roleName: m.role.name,
				}),
		);
		return {
			success: true,
			data: membersResponse,
			pagination:
				paginationUtils.convertPaginationResponseDtoFromTotalRecords(
					totalMembers,
				),
		};
	}

	async changeRoleMemberProject(
		projectId: string,
		userId: string,
		newRoleId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const existingProject = await this.projectsRepository.getProjectById(projectId);
		if (!existingProject) {
			throw new NotFoundException('Project not found');
		}

		const role = await this.rolesRepository.findById(newRoleId);
		if (!role) {
			throw new NotFoundException('Role not found');
		}
		if (role.status === RoleStatusEnum.INACTIVE) {
			throw new OptionalException(400, 'Role is inactive');
		}
		// Check xem role có phù hợp với phạm vi Project không (bắt đầu với PROJECT_)
		if (!role.name.startsWith('PROJECT_')) {
			throw new OptionalException(400, 'Role must be a project role (PROJECT_*)');
		}
		if (role.name === ProjectRoleEnum.PROJECT_ADMIN) {
			throw new OptionalException(400, 'Cannot assign project admin role');
		}
		const isMember = await this.projectMembersRepository.isUserMemberOfProject(
			projectId,
			userId,
		);
		if (!isMember) {
			throw new Forbidden('You are not a member of this project');
		}

		const changed = await this.projectMembersRepository.changeRoleOfMemberProject(
			projectId,
			userId,
			newRoleId,
		);

		return {
			success: changed.count > 0,
			data: null,
		};
	}

	async removeMember(
		projectId: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const existingProject = await this.projectsRepository.getProjectById(projectId);
		if (!existingProject) {
			throw new NotFoundException('Project not found');
		}
		const isMember = await this.projectMembersRepository.isUserMemberOfProject(
			projectId,
			userId,
		);

		if (!isMember) {
			throw new Forbidden('You are not a member of this project');
		}
		await this.projectMembersRepository.removeMember(projectId, userId);

		return {
			success: true,
			data: null,
		};
	}
}
