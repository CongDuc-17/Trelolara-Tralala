import { NextFunction, Request, Response } from 'express';
import passport from 'passport';

import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { registerRequestValidationSchema } from '@/modules/auth/dtos';

jest.mock('passport', () => ({ __esModule: true, default: { authenticate: jest.fn() } }));

function setup() {
	const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };
	const service = {
		register: jest.fn(async () => ({
			id: 'account-1',
			userId: 'user-1',
			email: 'user@example.com',
		})),
		login: jest.fn(async () => tokens),
		loginWithGoogle: jest.fn(async () => tokens),
		refreshSession: jest.fn(async () => tokens),
		logout: jest.fn(async () => undefined),
		forgotPassword: jest.fn(async () => ({ id: 'account-1', userId: 'user-1' })),
	};
	const response = {
		status: jest.fn(),
		json: jest.fn(),
		cookie: jest.fn(),
		clearCookie: jest.fn(),
		redirect: jest.fn(),
	};
	response.status.mockReturnValue(response);
	response.json.mockReturnValue(response);
	const request = {
		body: {},
		headers: {},
		user: { id: 'user-1' },
	} as unknown as Request;
	return {
		tokens,
		service,
		request,
		response,
		controller: new AuthController(service as unknown as AuthService),
	};
}

describe('Auth HTTP contracts with isolated service', () => {
	it('rejects a public ADMIN registration while keeping USER registration compatible', () => {
		const schema = registerRequestValidationSchema.body;
		const input = {
			email: 'reader@example.com',
			password: 'password123',
			name: 'Reader',
		};
		expect(schema.safeParse({ ...input, role: 'ADMIN' }).success).toBe(false);
		expect(schema.safeParse({ ...input, role: 'USER' }).success).toBe(true);
		expect(schema.safeParse(input).success).toBe(true);
	});

	it('register returns the original 201 success envelope', async () => {
		const { controller, service, request, response } = setup();
		request.body = {
			email: 'reader@example.com',
			password: 'password123',
			name: 'Reader',
		};
		await controller.register(request, response as unknown as Response);
		expect(service.register).toHaveBeenCalledWith(request.body);
		expect(response.status).toHaveBeenCalledWith(201);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: { id: 'account-1', userId: 'user-1', email: 'user@example.com' },
		});
	});

	it('login retains token response fields and sets both HTTP-only cookies', async () => {
		const { controller, request, response, tokens } = setup();
		await controller.login(request, response as unknown as Response);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: tokens });
		expect(response.cookie).toHaveBeenCalledWith(
			'accessToken',
			tokens.accessToken,
			expect.objectContaining({ httpOnly: true, path: '/' }),
		);
		expect(response.cookie).toHaveBeenCalledWith(
			'refreshToken',
			tokens.refreshToken,
			expect.objectContaining({ httpOnly: true, path: '/' }),
		);
	});

	it('refresh needs only the refresh cookie and preserves status 201', async () => {
		const { controller, request, response, service } = setup();
		request.headers.cookie = 'unrelated=value;refreshToken=supplied-token';
		await controller.refreshToken(request, response as unknown as Response);
		expect(service.refreshSession).toHaveBeenCalledWith('supplied-token');
		expect(response.status).toHaveBeenCalledWith(201);
	});

	it('missing refresh cookie fails before calling the service', async () => {
		const { controller, request, response, service } = setup();
		await expect(
			controller.refreshToken(request, response as unknown as Response),
		).rejects.toMatchObject({ status: 401 });
		expect(service.refreshSession).not.toHaveBeenCalled();
	});

	it('logout clears both cookies with matching options', async () => {
		const { controller, request, response, service } = setup();
		await controller.logout(request, response as unknown as Response);
		expect(service.logout).toHaveBeenCalledWith('user-1');
		expect(response.clearCookie).toHaveBeenCalledWith(
			'accessToken',
			expect.objectContaining({ httpOnly: true, path: '/' }),
		);
		expect(response.clearCookie).toHaveBeenCalledWith(
			'refreshToken',
			expect.objectContaining({ httpOnly: true, path: '/' }),
		);
	});

	it('forwards OAuth callback and session errors to Express', async () => {
		const { controller, request, response, service } = setup();
		(passport.authenticate as jest.Mock).mockReturnValue(jest.fn());
		const next = jest.fn() as NextFunction;
		controller.googleCallback(request, response as unknown as Response, next);
		const callback = (passport.authenticate as jest.Mock).mock.calls[0][2] as (
			error: Error | null,
			user?: { socialAccountInformation: { userId: string } },
		) => Promise<void>;
		const failure = new Error('Provider failure');
		await callback(failure);
		expect(next).toHaveBeenCalledWith(failure);
		service.loginWithGoogle.mockRejectedValueOnce(new Error('Session write failed'));
		await callback(null, { socialAccountInformation: { userId: 'user-1' } });
		expect(next).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Session write failed' }),
		);
	});

	it('successful OAuth callback sets cookies and retains the dashboard redirect', async () => {
		const { controller, request, response } = setup();
		(passport.authenticate as jest.Mock).mockReturnValue(jest.fn());
		controller.googleCallback(request, response as unknown as Response, jest.fn());
		const callback = (passport.authenticate as jest.Mock).mock.calls[0][2] as (
			error: Error | null,
			user: { socialAccountInformation: { userId: string } },
		) => Promise<void>;
		await callback(null, { socialAccountInformation: { userId: 'user-1' } });
		expect(response.cookie).toHaveBeenCalledTimes(2);
		expect(response.redirect).toHaveBeenCalledWith(
			`${process.env.FRONTEND_URL}/dashboard`,
		);
	});
});
