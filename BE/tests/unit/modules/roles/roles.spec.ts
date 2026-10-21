import type { Request, Response } from 'express';

jest.mock('@/modules/database', () => ({ prisma: {} }));

import { RoleController } from '@/modules/roles/role.controller';
import { RolesService } from '@/modules/roles/roles.service';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { UserRoleRepository } from '@/modules/userRole/userRole.repository';
import type { DatabaseClient } from '@/modules/database';

describe('role catalogue boundary', () => {
	it('assigns the requested system role idempotently using the injected transaction', async () => {
		const upsert = jest
			.fn()
			.mockResolvedValue({
				id: 'assignment-1',
				userId: 'user-1',
				roleId: 'role-1',
			});
		const repository = new UserRoleRepository({
			usersRoles: { upsert },
		} as unknown as DatabaseClient);
		expect(await repository.assignUserRole('user-1', 'role-1')).toEqual({
			id: 'assignment-1',
			userId: 'user-1',
			roleId: 'role-1',
		});
		expect(upsert).toHaveBeenCalledWith({
			where: { userId_roleId: { userId: 'user-1', roleId: 'role-1' } },
			create: { userId: 'user-1', roleId: 'role-1' },
			update: {},
		});
	});

	it('returns plain service data while preserving the HTTP envelope', async () => {
		const roles = [{ id: 'role-1', name: 'USER' }];
		const repository = { getAllRoles: jest.fn().mockResolvedValue(roles) };
		const service = new RolesService(repository as unknown as RolesRepository);
		expect(await service.getAllRoles()).toEqual(roles);
		const response = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		};
		const next = jest.fn();
		await new RoleController(service).getAllRoles(
			{} as Request,
			response as unknown as Response,
			next,
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			message: 'Roles retrieved successfully',
			data: roles,
		});
		expect(next).not.toHaveBeenCalled();
	});

	it('forwards repository errors to the shared HTTP error handler', async () => {
		const error = new Error('query failed');
		const service = { getAllRoles: jest.fn().mockRejectedValue(error) };
		const next = jest.fn();
		await new RoleController(service as unknown as RolesService).getAllRoles(
			{} as Request,
			{} as Response,
			next,
		);
		expect(next).toHaveBeenCalledWith(error);
	});
});
