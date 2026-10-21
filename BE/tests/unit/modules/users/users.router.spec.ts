import 'reflect-metadata';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express, { NextFunction, Request, Response } from 'express';

import { usersRouter } from '@/modules/users/users.router';
import { UsersService } from '@/modules/users/users.service';
import { UserProfile } from '@/modules/users/users.types';
import { errorHandlerMiddleware } from '@/common/middlewares/errorHandler.middleware';

jest.mock('@/common/middlewares/auth.middleware', () => ({
	__esModule: true,
	default: {
		verifyAccessToken(req: Request, _res: Response, next: NextFunction) {
			req.user = { id: '2ce1bb5a-e53e-4e0c-a862-6f49f75da15b' };
			next();
		},
	},
}));

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

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	const app = express();
	app.use(express.json());
	app.use('/users', usersRouter);
	app.use(errorHandlerMiddleware);
	server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
});

describe('Users router with isolated authentication and business service', () => {
	it('rejects bad UUID and unknown query filters before calling the profile service', async () => {
		const getUser = jest
			.spyOn(UsersService.prototype, 'getUserByUserId')
			.mockResolvedValue(user);
		for (const path of [
			'/users/invalid',
			`/users/${user.id}?status=INVALID`,
			`/users/${user.id}?unknown=1`,
		]) {
			const response = await fetch(baseUrl + path);
			expect(response.status).toBe(422);
			expect(await response.json()).toMatchObject({ success: false });
		}
		expect(getUser).not.toHaveBeenCalled();
	});

	it('parses multipart fields and files before validation and profile mutation', async () => {
		const update = jest
			.spyOn(UsersService.prototype, 'updateMyInformation')
			.mockResolvedValue(user);
		const body = new FormData();
		body.append('name', 'New name');
		body.append('bio', '');
		body.append(
			'avatar',
			new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
			'avatar.png',
		);
		const response = await fetch(baseUrl + '/users/me', { method: 'PUT', body });
		expect(response.status).toBe(200);
		expect(update).toHaveBeenCalledWith(
			{ name: 'New name', email: undefined, bio: undefined, address: undefined },
			user.id,
			expect.objectContaining({
				buffer: Buffer.from([1, 2, 3]),
				mimetype: 'image/png',
			}),
		);
	});

	it('rejects privilege fields in multipart requests before mutation', async () => {
		const update = jest
			.spyOn(UsersService.prototype, 'updateMyInformation')
			.mockResolvedValue(user);
		const body = new FormData();
		body.append('status', 'LOCKED');
		const response = await fetch(baseUrl + '/users/me', { method: 'PUT', body });
		expect(response.status).toBe(422);
		expect(update).not.toHaveBeenCalled();
	});

	it('keeps the password route validated before the Auth-backed mutation', async () => {
		const update = jest
			.spyOn(UsersService.prototype, 'updateMyPassword')
			.mockResolvedValue(user);
		const response = await fetch(baseUrl + '/users/me/change-password', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newPassword: 'short' }),
		});
		expect(response.status).toBe(422);
		expect(update).not.toHaveBeenCalled();
	});
});
