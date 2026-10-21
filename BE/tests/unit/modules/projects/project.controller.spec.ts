import { Request, Response } from 'express';

import { ProjectsController } from '@/modules/projects/project.controller';
import { ProjectsService } from '@/modules/projects/project.service';
import {
	CreateProjectRequestValidationSchema,
	RemoveMemberProjectRequestValidationSchema,
	getProjectsRequestValidationSchema,
} from '@/modules/projects/dtos/requests';

function response() {
	const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
	return res;
}
const request = (input: Partial<Request>) =>
	({ params: {}, body: {}, query: {}, user: { id: 'actor' }, ...input }) as Request;

it('keeps the project HTTP shape while excluding persistence-only fields', async () => {
	const now = new Date();
	const project = {
		id: 'project',
		name: 'Project',
		description: undefined,
		status: 'ACTIVE',
		createdAt: now,
		updatedAt: now,
		membersCount: 2,
		boardsCount: 3,
		deletedAt: null,
		_count: { members: 2 },
	};
	const service = { getProjectById: jest.fn(async () => project) };
	const controller = new ProjectsController(service as unknown as ProjectsService);
	const res = response();
	await controller.getProjectById(
		request({ params: { projectId: 'project' } }),
		res as unknown as Response,
	);
	expect(service.getProjectById).toHaveBeenCalledWith('project');
	expect(res.status).toHaveBeenCalledWith(200);
	expect(res.json).toHaveBeenCalledWith({
		success: true,
		data: {
			id: 'project',
			name: 'Project',
			description: undefined,
			status: 'ACTIVE',
			createdAt: now,
			updatedAt: now,
			membersCount: 2,
			boardsCount: 3,
		},
	});
});

it('keeps list pagination and membership role fields', async () => {
	const item = {
		id: 'project',
		name: 'Project',
		status: 'ARCHIVED',
		roleId: 'role',
		roleName: 'PROJECT_VIEWER',
		membersCount: 2,
		boardsCount: 3,
	};
	const service = {
		getAllProjects: jest.fn(async () => ({
			items: [item],
			totalItems: 5,
			page: 2,
			limit: 3,
		})),
	};
	const res = response();
	await new ProjectsController(service as unknown as ProjectsService).getAllProjects(
		request({ query: { page: '2', limit: '3', status: 'ARCHIVED' } }),
		res as unknown as Response,
	);
	expect(res.json).toHaveBeenCalledWith({
		success: true,
		data: [{ ...item, description: undefined }],
		pagination: { totalItems: 5, itemsPerPage: 3, currentPage: 2, totalPages: 2 },
	});
});

it('passes the authenticated actor for role changes and preserves mutation envelope', async () => {
	const service = { changeMemberRole: jest.fn(async () => undefined) };
	const res = response();
	await new ProjectsController(service as unknown as ProjectsService).changeMemberRole(
		request({
			params: { projectId: 'project' },
			body: { userId: 'target', roleId: 'role' },
		}),
		res as unknown as Response,
	);
	expect(service.changeMemberRole).toHaveBeenCalledWith(
		'project',
		'target',
		'role',
		'actor',
	);
	expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
});

it('validates removal IDs before resource lookup and parses query defaults', () => {
	expect(
		RemoveMemberProjectRequestValidationSchema.body!.safeParse({ userId: 'invalid' })
			.success,
	).toBe(false);
	expect(
		RemoveMemberProjectRequestValidationSchema.params!.safeParse({
			projectId: 'invalid',
		}).success,
	).toBe(false);
	expect(getProjectsRequestValidationSchema.query!.parse({ page: '2' })).toEqual({
		page: 2,
		limit: 10,
	});
	expect(
		CreateProjectRequestValidationSchema.body!.parse({
			name: 'Project',
			status: 'DELETED',
		}),
	).toEqual({ name: 'Project' });
});
