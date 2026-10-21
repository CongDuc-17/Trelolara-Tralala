import { Request, Response } from 'express';

import { UsersController } from '@/modules/users/users.controller';
import { UsersService } from '@/modules/users/users.service';
import { UserProfile } from '@/modules/users/users.types';
import {
	GetUserResponseDto,
	getUserByUserIdRequestValidationSchema,
	getUsersRequestValidationSchema,
	updateMyInformationRequestBody,
	updateMyPasswordRequestValidationSchema,
} from '@/modules/users/dtos';

const user: UserProfile = {
	id: '2ce1bb5a-e53e-4e0c-a862-6f49f75da15b',
	email: 'reader@example.com',
	name: 'Reader',
	avatar: null,
	bio: null,
	address: null,
	status: 'ACTIVE',
	verify: true,
	createdAt: new Date(),
	updatedAt: new Date(),
	deletedAt: null,
};

function setup() {
	const service = {
		getUsers: jest.fn(async () => ({
			items: [user],
			totalItems: 21,
			page: 2,
			limit: 10,
		})),
		getUserByUserId: jest.fn(async () => user),
		updateMyInformation: jest.fn(async () => user),
		updateMyPassword: jest.fn(async () => user),
	};
	const response = { status: jest.fn(), json: jest.fn() };
	response.status.mockReturnValue(response);
	response.json.mockReturnValue(response);
	return {
		controller: new UsersController(service as unknown as UsersService),
		service,
		response,
		res: response as unknown as Response,
		request: { user, params: {}, query: {}, body: {} } as unknown as Request,
	};
}

describe('Users HTTP contract and parsed DTOs', () => {
	it('keeps list fields and pagination while leaving verify out of the response', async () => {
		const { controller, request, res, response, service } = setup();
		request.query = { name: 'Reader', page: '2', limit: '10' };
		await controller.getUsers(request, res);
		expect(service.getUsers).toHaveBeenCalledWith(
			{ name: 'Reader', status: undefined },
			{ page: 2, limit: 10 },
		);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: [
				{
					id: user.id,
					email: user.email,
					name: user.name,
					avatar: null,
					status: 'ACTIVE',
					updatedAt: user.updatedAt,
					deletedAt: null,
				},
			],
			pagination: {
				totalItems: 21,
				itemsPerPage: 10,
				currentPage: 2,
				totalPages: 3,
			},
		});
		expect(response.json.mock.calls[0][0].data[0]).not.toHaveProperty('verify');
	});

	it('keeps profile fields and status200 for /me', () => {
		const { controller, request, res, response } = setup();
		controller.getMyInformation(request, res);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: {
				id: user.id,
				email: user.email,
				name: user.name,
				avatar: null,
				bio: null,
				address: null,
				status: 'ACTIVE',
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
				deletedAt: null,
			},
		});
	});

	it('keeps by-id query filters and profile fields', async () => {
		const { controller, request, res, response, service } = setup();
		request.params = { userId: user.id };
		request.query = { status: 'LOCKED' };
		await controller.getUserByUserId(request, res);
		expect(service.getUserByUserId).toHaveBeenCalledWith({
			userId: user.id,
			status: 'LOCKED',
		});
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: new GetUserResponseDto(user),
		});
	});

	it('passes parsed whitelist fields and multipart file to the service', async () => {
		const { controller, request, res, service } = setup();
		request.body = updateMyInformationRequestBody.parse({
			name: 'New',
			email: '  ',
			bio: '',
		});
		await controller.updateMyInformation(request, res);
		expect(service.updateMyInformation).toHaveBeenCalledWith(
			{ name: 'New', email: undefined, bio: undefined, address: undefined },
			user.id,
			undefined,
		);
	});

	it('keeps the existing newPassword-only input and profile response', async () => {
		const { controller, request, res, response, service } = setup();
		request.body = { newPassword: 'new-password' };
		await controller.updateMyPassword(request, res);
		expect(service.updateMyPassword).toHaveBeenCalledWith('new-password', user);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: new GetUserResponseDto(user),
		});
	});

	it('propagates a conflict for the error middleware instead of masking it as500', async () => {
		const { controller, request, res, service, response } = setup();
		const conflict = Object.assign(new Error('Email in use'), { status: 409 });
		service.updateMyInformation.mockRejectedValueOnce(conflict);
		await expect(controller.updateMyInformation(request, res)).rejects.toBe(conflict);
		expect(response.status).not.toHaveBeenCalled();
	});

	it('validates by-id params/query, pagination, profile whitelist and password', () => {
		expect(
			getUserByUserIdRequestValidationSchema.params!.safeParse({ userId: 'bad' })
				.success,
		).toBe(false);
		expect(
			getUserByUserIdRequestValidationSchema.query!.safeParse({ status: 'UNKNOWN' })
				.success,
		).toBe(false);
		expect(
			getUsersRequestValidationSchema.query!.safeParse({ page: '-1' }).success,
		).toBe(false);
		expect(getUsersRequestValidationSchema.query!.parse({})).toEqual({
			page: 1,
			limit: 10,
		});
		expect(
			updateMyInformationRequestBody.safeParse({ status: 'LOCKED' }).success,
		).toBe(false);
		expect(
			updateMyInformationRequestBody.safeParse({
				avatar: { public_id: 'another-user' },
			}).success,
		).toBe(false);
		expect(
			updateMyPasswordRequestValidationSchema.body!.safeParse({
				newPassword: 'short',
			}).success,
		).toBe(false);
		expect(
			updateMyPasswordRequestValidationSchema.body!.safeParse({
				newPassword: 'long-password',
			}).success,
		).toBe(true);
	});
});
