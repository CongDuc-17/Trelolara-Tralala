import { Request, Response } from 'express';

import { PaginationDto } from '@/common/dtos/pagination.dto';
import { ProjectsService } from './project.service';
import { ProjectStatus } from './projects.types';
import {
	GetMembersResponseDTO,
	GetProjectResponseDTO,
	GetProjectsResponseDTO,
} from './dtos/responses';

export class ProjectsController {
	constructor(private readonly projectService = new ProjectsService()) {}

	async createProject(req: Request, res: Response): Promise<Response> {
		const project = await this.projectService.createProject(req.body, req.user!.id!);
		return res
			.status(200)
			.json({ success: true, data: new GetProjectResponseDTO(project) });
	}

	async getAllProjects(req: Request, res: Response): Promise<Response> {
		const projects = await this.projectService.getAllProjects(
			req.user!.id!,
			req.query as { status?: ProjectStatus },
			new PaginationDto(req.query),
		);
		return res.status(200).json({
			success: true,
			data: projects.items.map((project) => new GetProjectsResponseDTO(project)),
			pagination: {
				totalItems: projects.totalItems,
				itemsPerPage: projects.limit,
				currentPage: projects.page,
				totalPages: Math.ceil(projects.totalItems / projects.limit),
			},
		});
	}

	async getProjectById(req: Request, res: Response): Promise<Response> {
		const project = await this.projectService.getProjectById(
			req.params.projectId as string,
		);
		return res
			.status(200)
			.json({ success: true, data: new GetProjectResponseDTO(project) });
	}

	async updateProject(req: Request, res: Response): Promise<Response> {
		const project = await this.projectService.updateProject(
			req.params.projectId as string,
			req.body,
		);
		return res
			.status(200)
			.json({ success: true, data: new GetProjectResponseDTO(project) });
	}

	async archiveProject(req: Request, res: Response): Promise<Response> {
		await this.projectService.archiveProject(req.params.projectId as string);
		return res.status(200).json({ success: true, data: null });
	}

	async restoreProject(req: Request, res: Response): Promise<Response> {
		await this.projectService.restoreProject(req.params.projectId as string);
		return res.status(200).json({ success: true, data: null });
	}

	async deleteProject(req: Request, res: Response): Promise<Response> {
		await this.projectService.softDeleteProject(req.params.projectId as string);
		return res.status(200).json({ success: true, data: null });
	}

	async getProjectMembers(req: Request, res: Response): Promise<Response> {
		const members = await this.projectService.getProjectMembers(
			req.params.projectId as string,
			new PaginationDto(req.query),
		);
		return res.status(200).json({
			success: true,
			data: members.items.map((member) => new GetMembersResponseDTO(member)),
			pagination: {
				totalItems: members.totalItems,
				itemsPerPage: members.limit,
				currentPage: members.page,
				totalPages: Math.ceil(members.totalItems / members.limit),
			},
		});
	}

	async changeMemberRole(req: Request, res: Response): Promise<Response> {
		await this.projectService.changeMemberRole(
			req.params.projectId as string,
			req.body.userId,
			req.body.roleId,
			req.user!.id!,
		);
		return res.status(200).json({ success: true, data: null });
	}

	async removeMember(req: Request, res: Response): Promise<Response> {
		await this.projectService.removeMember(
			req.params.projectId as string,
			req.body.userId,
			req.user!.id!,
		);
		return res.status(200).json({ success: true, data: null });
	}
}
