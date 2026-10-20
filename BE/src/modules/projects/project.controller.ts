import { Request, Response } from 'express';
import { ProjectsService } from './project.service';
import { CreateProjectRequestDto } from './dtos/requests/createProject.request';
import { HttpResponseDto } from '@/common/dtos/httpResponse.dto';
import { Exception } from '@/common/exceptions/app-error';
import { GetProjectsResponseDTO } from './dtos/responses/getProjects.response';
import { GetMembersResponseDTO, GetProjectResponseDTO } from './dtos/responses';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { GetProjectsRequestDto } from './dtos/requests';
export class ProjectsController {
	constructor(
		private readonly projectService: ProjectsService = new ProjectsService(),
	) {}

	async createProject(req: Request): Promise<Response> {
		const createProjectDto = new CreateProjectRequestDto(req.body);
		const userId = (req.user as { id: string }).id;
		const result = await this.projectService.createProject(createProjectDto, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetProjectResponseDTO>(result);
	}

	async getAllProjects(req: Request): Promise<Response> {
		const userId = (req.user as { id: string }).id;
		const pagination: PaginationDto = new PaginationDto(req.query);
		const getProjectsRequest: GetProjectsRequestDto = new GetProjectsRequestDto(
			req.query,
		);
		const result = await this.projectService.getAllProjects(
			userId,
			getProjectsRequest,
			pagination,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetProjectsResponseDTO[]>(result);
	}

	async getProjectById(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const userId = (req.user as { id: string }).id;

		const result = await this.projectService.getProjectById(projectId, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetProjectResponseDTO>(result);
	}

	async updateProject(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const updateData = req.body;

		const result = await this.projectService.updateInformationProject(
			projectId,
			updateData,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetProjectResponseDTO>(result);
	}

	async archiveProject(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const result = await this.projectService.archiveProject(projectId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async restoreProject(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const result = await this.projectService.restoreProject(projectId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async deleteProject(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const result = await this.projectService.softDeleteProject(projectId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async getProjectMembers(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const pagination: PaginationDto = new PaginationDto(req.query);
		const result = await this.projectService.getProjectMembers(projectId, pagination);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetMembersResponseDTO[]>(result);
	}

	async changeRoleMemberProject(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;

		const { userId, roleId } = req.body;
		const result = await this.projectService.changeRoleMemberProject(
			projectId,
			userId,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async removeMember(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const { userId } = req.body;
		const result = await this.projectService.removeMember(projectId, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}
}
