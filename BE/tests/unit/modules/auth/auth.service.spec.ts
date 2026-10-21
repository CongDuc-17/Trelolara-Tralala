import { compare, hash } from 'bcrypt';

import { AuthRepository } from '@/modules/auth/auth.repository';
import { AuthService } from '@/modules/auth/auth.service';
import { AuthAccount, AuthUser } from '@/modules/auth/auth.types';
import { DatabaseClient } from '@/modules/database';
import { MailsService } from '@/modules/mails/mail.service';
import { OtpsService } from '@/modules/otps/otps.service';
import { getTokenExpiry, signJWT } from '@/common/utils/jwt.utils';

jest.mock('@/configs/otps.config', () => ({
	otpsConfig: { otpExpiresIn: 5, maxAttempts: 5 },
}));
jest.mock('@/configs/users.config', () => ({
	usersConfig: { defaultAvatarUrl: 'https://example.com/avatar.png' },
}));

const user: AuthUser = {
	id: 'user-1',
	email: 'reader@example.com',
	name: 'Reader',
	bio: null,
	address: null,
	avatar: null,
	verify: true,
	status: 'ACTIVE',
	createdAt: new Date(),
	updatedAt: new Date(),
	deletedAt: null,
};

let account: AuthAccount;

beforeAll(async () => {
	account = {
		id: 'account-1',
		userId: user.id,
		salt: 'unused-by-compare',
		password: await hash('password123', 4),
		user,
	};
});

function setup() {
	const commits: unknown[] = [];
	const client = {} as DatabaseClient;
	const repository = {
		findUser: jest.fn(async () => user as AuthUser | null),
		findAccount: jest.fn(async () => account as AuthAccount | null),
		findVerificationAccount: jest.fn(
			async () => account as Pick<AuthAccount, 'id' | 'userId' | 'user'> | null,
		),
		lockUser: jest.fn(async () => undefined),
		createRegisteredAccount: jest.fn(
			async (_input: Parameters<AuthRepository['createRegisteredAccount']>[0]) =>
				account,
		),
		createSession: jest.fn(async () => undefined),
		findSession: jest.fn(
			async () =>
				({ userId: user.id, expiresAt: new Date(Date.now() + 60_000) }) as {
					userId: string;
					expiresAt: Date;
				} | null,
		),
		consumeSession: jest.fn(async () => true),
		revokeSessions: jest.fn(async () => undefined),
		markVerified: jest.fn(async () => ({ ...user, verify: true })),
		updatePassword: jest.fn(async () => account),
		upsertPassword: jest.fn(
			async (_input: Parameters<AuthRepository['upsertPassword']>[0]) => undefined,
		),
		inTransaction: jest.fn(),
	};
	repository.inTransaction.mockImplementation(
		async (work: Parameters<AuthRepository['inTransaction']>[0]) => {
			const result = await work(repository as unknown as AuthRepository, client);
			commits.push(result);
			return result;
		},
	);
	const generatedOtp = { otp: '123456', expiresAt: new Date(Date.now() + 60_000) };
	const otps = {
		generateOtp: jest.fn(async () => generatedOtp),
		verifyOtp: jest.fn(async () => true),
		invalidateOtp: jest.fn(async () => undefined),
	};
	const mail = { sendEmail: jest.fn(async () => ({ success: true })) };
	const service = new AuthService(
		repository as unknown as AuthRepository,
		otps as unknown as OtpsService,
		mail as unknown as MailsService,
	);
	return { service, repository, otps, mail, commits, client, generatedOtp };
}

describe('AuthService with isolated adapters', () => {
	it('generates OTP under the user lock and rejects an address changed while waiting for the lock', async () => {
		const f = setup();
		await f.service.sendOtp({ email: user.email });
		expect(f.otps.generateOtp).toHaveBeenCalledWith({ userId: user.id }, f.client);
		expect(f.repository.lockUser.mock.invocationCallOrder[0]).toBeLessThan(
			f.otps.generateOtp.mock.invocationCallOrder[0],
		);
		const changed = setup();
		changed.repository.findUser
			.mockResolvedValueOnce(user)
			.mockResolvedValueOnce({ ...user, email: 'changed@example.com' });
		await expect(
			changed.service.sendOtp({ email: user.email }),
		).rejects.toMatchObject({ status: 404 });
		expect(changed.otps.generateOtp).not.toHaveBeenCalled();
		expect(changed.mail.sendEmail).not.toHaveBeenCalled();
	});
	it('ignores any role passed outside HTTP validation and creates USER through the repository contract', async () => {
		const { service, repository } = setup();
		repository.findUser.mockResolvedValueOnce(null);
		const input = {
			email: user.email,
			name: user.name,
			password: 'password123',
			role: 'ADMIN',
		};
		const result = await service.register(input);
		const creation = repository.createRegisteredAccount.mock.calls[0][0];
		expect(creation).not.toHaveProperty('role');
		expect(creation.password).not.toBe(input.password);
		expect(result).toMatchObject({ userId: user.id, email: user.email });
		expect(result).not.toHaveProperty('password');
		expect(result).not.toHaveProperty('success');
	});

	it('maps a concurrent email uniqueness conflict without sending OTP', async () => {
		const { service, repository, otps } = setup();
		repository.findUser.mockResolvedValueOnce(null);
		repository.createRegisteredAccount.mockRejectedValueOnce({ code: 'P2002' });
		await expect(
			service.register({
				email: user.email,
				name: user.name,
				password: 'password123',
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(otps.generateOtp).not.toHaveBeenCalled();
	});

	it('keeps a created registration recoverable through resend when email delivery fails', async () => {
		const { service, repository, mail, otps } = setup();
		repository.findUser.mockResolvedValueOnce(null);
		mail.sendEmail.mockRejectedValueOnce(
			Object.assign(new Error('Email delivery failed'), { status: 503 }),
		);
		await expect(
			service.register({
				email: user.email,
				name: user.name,
				password: 'password123',
			}),
		).rejects.toMatchObject({ status: 503 });
		expect(repository.createRegisteredAccount).toHaveBeenCalledTimes(1);
		expect(otps.invalidateOtp).toHaveBeenCalledTimes(1);
		await expect(service.sendOtp({ email: user.email })).resolves.toBeUndefined();
		expect(mail.sendEmail).toHaveBeenCalledTimes(2);
	});

	it('uses bcrypt comparison and persists the actual JWT expiration', async () => {
		const { service, repository } = setup();
		const tokens = await service.login({
			email: user.email,
			password: 'password123',
		});
		expect(repository.createSession).toHaveBeenCalledWith(
			user.id,
			tokens.refreshToken,
			getTokenExpiry(tokens.refreshToken),
		);
		expect(repository.lockUser).toHaveBeenCalledWith(user.id);
	});

	it('rereads credentials after acquiring the account lock', async () => {
		const { service, repository } = setup();
		repository.findAccount.mockResolvedValueOnce(account).mockResolvedValueOnce({
			...account,
			password: await hash('new-password', 4),
		});
		await expect(
			service.login({ email: user.email, password: 'password123' }),
		).rejects.toMatchObject({ status: 401 });
		expect(repository.createSession).not.toHaveBeenCalled();
	});

	it.each([
		[{ ...user, status: 'LOCKED' as const }, 403],
		[{ ...user, verify: false }, 403],
		[{ ...user, deletedAt: new Date() }, 401],
	])(
		'rejects an unavailable user before issuing a session',
		async (unavailable, status) => {
			const { service, repository } = setup();
			repository.findUser.mockResolvedValue(unavailable);
			await expect(service.loginWithGoogle(user.id)).rejects.toMatchObject({
				status,
			});
			expect(repository.createSession).not.toHaveBeenCalled();
		},
	);

	it('rejects invalid refresh signatures before touching the DB', async () => {
		const { service, repository } = setup();
		await expect(service.refreshSession('invalid')).rejects.toMatchObject({
			status: 401,
		});
		expect(repository.inTransaction).not.toHaveBeenCalled();
	});

	it('authenticates a valid access token against the current persisted account', async () => {
		const { service, repository } = setup();
		const tokens = await signJWT({ userId: user.id });
		await expect(
			service.authenticateAccessToken(tokens.accessToken),
		).resolves.toEqual(user);
		expect(repository.findUser).toHaveBeenCalledWith({ userId: user.id });
		repository.findUser.mockResolvedValueOnce({ ...user, status: 'LOCKED' });
		await expect(
			service.authenticateAccessToken(tokens.accessToken),
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects a signed refresh token missing from persistent sessions', async () => {
		const { service, repository } = setup();
		repository.findSession.mockResolvedValueOnce(null);
		await expect(
			service.refreshSession((await signJWT({ userId: user.id })).refreshToken),
		).rejects.toMatchObject({ status: 401 });
		expect(repository.createSession).not.toHaveBeenCalled();
	});

	it('rejects DB-expired or wrong-user refresh sessions', async () => {
		for (const session of [
			{ userId: user.id, expiresAt: new Date(Date.now() - 1) },
			{ userId: 'someone-else', expiresAt: new Date(Date.now() + 60_000) },
		]) {
			const { service, repository } = setup();
			repository.findSession.mockResolvedValueOnce(session);
			await expect(
				service.refreshSession((await signJWT({ userId: user.id })).refreshToken),
			).rejects.toMatchObject({ status: 401 });
			expect(repository.consumeSession).not.toHaveBeenCalled();
		}
	});

	it('rotates exactly the supplied token without deleting other sessions or requiring an access token', async () => {
		const { service, repository } = setup();
		const old = await signJWT({ userId: user.id });
		const tokens = await service.refreshSession(old.refreshToken);
		expect(tokens.refreshToken).not.toBe(old.refreshToken);
		expect(repository.consumeSession).toHaveBeenCalledWith(user.id, old.refreshToken);
		expect(repository.revokeSessions).not.toHaveBeenCalled();
	});

	it('allows only one contender to consume the same refresh token', async () => {
		const { service, repository } = setup();
		repository.consumeSession
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false);
		const old = await signJWT({ userId: user.id });
		const results = await Promise.allSettled([
			service.refreshSession(old.refreshToken),
			service.refreshSession(old.refreshToken),
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(repository.createSession).toHaveBeenCalledTimes(1);
	});

	it('logout revokes all account refresh tokens under the same user lock', async () => {
		const { service, repository } = setup();
		await service.logout(user.id);
		expect(repository.revokeSessions).toHaveBeenCalledWith(user.id);
		expect(repository.lockUser).toHaveBeenCalledWith(user.id);
	});

	it('ordinary password change creates or replaces credentials and revokes all sessions under the same lock', async () => {
		const { service, repository } = setup();
		await expect(
			service.changePassword(user.id, 'new-password'),
		).resolves.toBeUndefined();
		expect(repository.lockUser).toHaveBeenCalledWith(user.id);
		expect(repository.findUser).toHaveBeenCalledWith({ userId: user.id });
		const input = repository.upsertPassword.mock.calls[0][0];
		expect(input).toMatchObject({ userId: user.id });
		expect(await compare('new-password', input.password)).toBe(true);
		expect(repository.revokeSessions).toHaveBeenCalledWith(user.id);
		expect(repository.markVerified).not.toHaveBeenCalled();
		expect(repository.createSession).not.toHaveBeenCalled();
	});

	it('password change rejects an unavailable account before credential or session writes', async () => {
		const { service, repository } = setup();
		repository.findUser.mockResolvedValueOnce(null);
		await expect(
			service.changePassword(user.id, 'new-password'),
		).rejects.toMatchObject({ status: 401 });
		expect(repository.upsertPassword).not.toHaveBeenCalled();
		expect(repository.revokeSessions).not.toHaveBeenCalled();
	});

	it('password change does not commit credentials if revoking sessions fails', async () => {
		const { service, repository, commits } = setup();
		repository.revokeSessions.mockRejectedValueOnce(new Error('DB failure'));
		await expect(service.changePassword(user.id, 'new-password')).rejects.toThrow(
			'DB failure',
		);
		expect(repository.upsertPassword).toHaveBeenCalledTimes(1);
		expect(commits).toEqual([]);
	});

	it('cleans only the generated OTP when sending fails', async () => {
		const { service, mail, otps, generatedOtp } = setup();
		const failure = new Error('Delivery failed');
		mail.sendEmail.mockRejectedValueOnce(failure);
		await expect(service.sendOtp({ email: user.email })).rejects.toBe(failure);
		expect(otps.invalidateOtp).toHaveBeenCalledWith({
			userId: user.id,
			otp: generatedOtp.otp,
			expiresAt: generatedOtp.expiresAt,
		});
	});

	it('commits a failed OTP attempt before returning the validation error', async () => {
		const { service, repository, otps, commits } = setup();
		repository.findVerificationAccount.mockResolvedValue({
			...account,
			user: { ...user, verify: false },
		});
		otps.verifyOtp.mockResolvedValueOnce(false);
		await expect(
			service.verify({ email: user.email, otp: '000000' }),
		).rejects.toMatchObject({ status: 400 });
		expect(commits).toEqual([null]);
		expect(repository.markVerified).not.toHaveBeenCalled();
	});

	it('verification consumes OTP and updates the account in one transaction without invitation effects', async () => {
		const { service, repository, otps, client } = setup();
		repository.findVerificationAccount.mockResolvedValue({
			...account,
			user: { ...user, verify: false },
		});
		await expect(
			service.verify({ email: user.email, otp: '123456' }),
		).resolves.toMatchObject({ verify: true });
		expect(otps.verifyOtp).toHaveBeenCalledWith(
			{ userId: user.id, otp: '123456' },
			client,
		);
		expect(repository.markVerified).toHaveBeenCalledWith(user.id);
	});

	it('verifies a changed email for an OAuth-only identity without creating local credentials', async () => {
		const f = setup();
		f.repository.findVerificationAccount.mockResolvedValue({
			id: 'social-identity',
			userId: user.id,
			user: { ...user, verify: false },
		});
		await expect(
			f.service.verify({ email: user.email, otp: '123456' }),
		).resolves.toMatchObject({
			id: 'social-identity',
			userId: user.id,
			verify: true,
		});
		expect(f.repository.upsertPassword).not.toHaveBeenCalled();
	});

	it('password reset consumes OTP, updates credentials and revokes every session atomically', async () => {
		const { service, repository, otps, client } = setup();
		await service.forgotPassword({
			email: user.email,
			newPassword: 'new-password',
			otp: '123456',
		});
		expect(otps.verifyOtp).toHaveBeenCalledWith(
			{ userId: user.id, otp: '123456' },
			client,
		);
		expect(repository.updatePassword).toHaveBeenCalledWith(
			expect.objectContaining({ userId: user.id }),
		);
		expect(repository.revokeSessions).toHaveBeenCalledWith(user.id);
	});

	it('failed password-reset OTP commits the attempt without changing credentials', async () => {
		const { service, repository, otps, commits } = setup();
		otps.verifyOtp.mockResolvedValueOnce(false);
		await expect(
			service.forgotPassword({
				email: user.email,
				newPassword: 'new-password',
				otp: '000000',
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(commits).toEqual([null]);
		expect(repository.updatePassword).not.toHaveBeenCalled();
		expect(repository.revokeSessions).not.toHaveBeenCalled();
	});

	it('does not commit a partially completed password reset', async () => {
		const { service, repository, commits } = setup();
		repository.revokeSessions.mockRejectedValueOnce(new Error('DB failure'));
		await expect(
			service.forgotPassword({
				email: user.email,
				newPassword: 'new-password',
				otp: '123456',
			}),
		).rejects.toThrow('DB failure');
		expect(commits).toEqual([]);
	});
});
