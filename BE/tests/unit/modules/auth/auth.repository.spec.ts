import { AuthRepository } from '@/modules/auth/auth.repository';
import { DatabaseClient } from '@/modules/database';

function setup() {
	const transaction = {
		$queryRaw: jest.fn(async () => []),
		users: {
			findFirst: jest.fn(
				async () =>
					null as {
						id: string;
						email: string;
						verify: boolean;
						status: string;
					} | null,
			),
			create: jest.fn(async () => ({
				id: 'user-1',
				email: 'reader@example.com',
				verify: true,
				status: 'ACTIVE',
			})),
			update: jest.fn(),
		},
		usersRoles: {
			findFirst: jest.fn(async () => null as { id: string } | null),
			upsert: jest.fn(),
		},
		socialAccounts: {
			findUnique: jest.fn(
				async () =>
					null as { googleId: string; googleRefreshToken: string } | null,
			),
			upsert: jest.fn(async () => ({ userId: 'user-1' })),
		},
		roles: {
			findFirst: jest.fn(
				async () => ({ id: 'default-user-role' }) as { id: string } | null,
			),
		},
		accounts: {
			create: jest.fn(async () => ({ id: 'account-1' })),
			upsert: jest.fn(async () => undefined),
		},
		tokens: {
			deleteMany: jest.fn(async () => ({ count: 1 })),
			create: jest.fn(),
			findUnique: jest.fn(),
		},
	};
	const database = {
		$transaction: jest.fn(
			async (work: (client: typeof transaction) => Promise<unknown>) =>
				work(transaction),
		),
	};
	return {
		repository: new AuthRepository(database as unknown as DatabaseClient),
		transaction,
		database,
	};
}

describe('AuthRepository query and transaction boundaries', () => {
	const registration = {
		email: 'new@example.com',
		name: 'New',
		password: 'hash',
		salt: 'salt',
		avatar: 'https://example.com/avatar.png',
	};

	it('creates account, user and USER membership as one nested write on the transaction client', async () => {
		const { repository, transaction, database } = setup();
		await repository.createRegisteredAccount(registration);
		expect(database.$transaction).toHaveBeenCalledTimes(1);
		expect(transaction.roles.findFirst).toHaveBeenCalledWith({
			where: { name: 'USER', status: 'ACTIVE', deletedAt: null },
			select: { id: true },
		});
		expect(transaction.accounts.create).toHaveBeenCalledWith({
			include: { user: true },
			data: {
				password: 'hash',
				salt: 'salt',
				user: {
					create: {
						email: registration.email,
						name: registration.name,
						avatar: registration.avatar,
						usersRoles: { create: { roleId: 'default-user-role' } },
					},
				},
			},
		});
	});

	it('fails before creating an account when the required default role is missing', async () => {
		const { repository, transaction } = setup();
		transaction.roles.findFirst.mockResolvedValueOnce(null);
		await expect(
			repository.createRegisteredAccount(registration),
		).rejects.toMatchObject({ status: 500 });
		expect(transaction.accounts.create).not.toHaveBeenCalled();
	});

	it('does not swallow failures from the atomic account write', async () => {
		const { repository, transaction } = setup();
		transaction.accounts.create.mockRejectedValueOnce(
			new Error('Database write failed'),
		);
		await expect(repository.createRegisteredAccount(registration)).rejects.toThrow(
			'Database write failed',
		);
	});

	it('consumes only the exact, unexpired refresh token', async () => {
		const { transaction } = setup();
		const repository = new AuthRepository(transaction as unknown as DatabaseClient);
		await expect(repository.consumeSession('user-1', 'supplied-token')).resolves.toBe(
			true,
		);
		expect(transaction.tokens.deleteMany).toHaveBeenCalledWith({
			where: {
				userId: 'user-1',
				refreshToken: 'supplied-token',
				expiresAt: { gt: expect.any(Date) },
			},
		});
		transaction.tokens.deleteMany.mockResolvedValueOnce({ count: 0 });
		await expect(repository.consumeSession('user-1', 'replayed-token')).resolves.toBe(
			false,
		);
	});

	it('revoke removes every refresh token belonging to exactly that account', async () => {
		const { transaction } = setup();
		await new AuthRepository(transaction as unknown as DatabaseClient).revokeSessions(
			'user-1',
		);
		expect(transaction.tokens.deleteMany).toHaveBeenCalledWith({
			where: { userId: 'user-1' },
		});
	});

	it('password upsert supports Google-only users without changing profile or verification', async () => {
		const { transaction } = setup();
		await new AuthRepository(transaction as unknown as DatabaseClient).upsertPassword(
			{
				userId: 'user-1',
				password: 'hash',
				salt: 'salt',
			},
		);
		expect(transaction.accounts.upsert).toHaveBeenCalledWith({
			where: { userId: 'user-1' },
			create: { userId: 'user-1', password: 'hash', salt: 'salt' },
			update: { password: 'hash', salt: 'salt' },
		});
		expect(transaction.users.update).not.toHaveBeenCalled();
	});

	const google = {
		googleId: 'google-1',
		email: 'reader@example.com',
		name: 'Reader',
		accessToken: 'provider-access',
	};

	it('creates Google user, USER role and provider link within the same transaction', async () => {
		const { repository, transaction, database } = setup();
		await expect(repository.connectGoogleAccount(google)).resolves.toEqual({
			userId: 'user-1',
		});
		expect(database.$transaction).toHaveBeenCalledTimes(1);
		expect(transaction.users.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				verify: true,
				usersRoles: { create: { roleId: 'default-user-role' } },
			}),
		});
		expect(transaction.socialAccounts.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					userId: 'user-1',
					googleId: google.googleId,
					googleRefreshToken: '',
				}),
			}),
		);
	});

	it('rolls back Google provisioning when the default USER role is absent', async () => {
		const { repository, transaction } = setup();
		transaction.roles.findFirst.mockResolvedValueOnce(null);
		await expect(repository.connectGoogleAccount(google)).rejects.toMatchObject({
			status: 500,
		});
		expect(transaction.users.create).not.toHaveBeenCalled();
		expect(transaction.socialAccounts.upsert).not.toHaveBeenCalled();
	});

	it('rejects locked Google users without linking or updating a provider account', async () => {
		const { repository, transaction } = setup();
		transaction.users.findFirst.mockResolvedValue({
			id: 'user-1',
			email: google.email,
			verify: true,
			status: 'LOCKED',
		});
		await expect(repository.connectGoogleAccount(google)).rejects.toMatchObject({
			status: 403,
		});
		expect(transaction.socialAccounts.upsert).not.toHaveBeenCalled();
	});

	it('rechecks Google account availability after acquiring its row lock', async () => {
		const { repository, transaction } = setup();
		transaction.users.findFirst
			.mockResolvedValueOnce({
				id: 'user-1',
				email: google.email,
				verify: false,
				status: 'ACTIVE',
			})
			.mockResolvedValueOnce({
				id: 'user-1',
				email: google.email,
				verify: false,
				status: 'LOCKED',
			});
		await expect(repository.connectGoogleAccount(google)).rejects.toMatchObject({
			status: 403,
		});
		expect(transaction.users.update).not.toHaveBeenCalled();
		expect(transaction.socialAccounts.upsert).not.toHaveBeenCalled();
	});

	it('repairs a legacy missing system role without granting ADMIN and verifies the provider email', async () => {
		const { repository, transaction } = setup();
		transaction.users.findFirst.mockResolvedValue({
			id: 'user-1',
			email: google.email,
			verify: false,
			status: 'ACTIVE',
		});
		await repository.connectGoogleAccount(google);
		expect(transaction.usersRoles.upsert).toHaveBeenCalledWith({
			where: { userId_roleId: { userId: 'user-1', roleId: 'default-user-role' } },
			create: { userId: 'user-1', roleId: 'default-user-role' },
			update: {},
		});
		expect(transaction.users.update).toHaveBeenCalledWith({
			where: { id: 'user-1' },
			data: { verify: true },
		});
	});

	it('retains the provider refresh token when Google does not return a replacement', async () => {
		const { repository, transaction } = setup();
		transaction.users.findFirst.mockResolvedValue({
			id: 'user-1',
			email: google.email,
			verify: true,
			status: 'ACTIVE',
		});
		transaction.usersRoles.findFirst.mockResolvedValueOnce({
			id: 'existing-system-role',
		});
		transaction.socialAccounts.findUnique.mockResolvedValueOnce({
			googleId: google.googleId,
			googleRefreshToken: 'existing-provider-refresh',
		});
		await repository.connectGoogleAccount(google);
		expect(transaction.socialAccounts.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				update: { googleAccessToken: google.accessToken },
			}),
		);
		expect(transaction.usersRoles.upsert).not.toHaveBeenCalled();
	});

	it('rejects replacing an existing link with a different Google identity', async () => {
		const { repository, transaction } = setup();
		transaction.users.findFirst.mockResolvedValue({
			id: 'user-1',
			email: google.email,
			verify: true,
			status: 'ACTIVE',
		});
		transaction.usersRoles.findFirst.mockResolvedValueOnce({
			id: 'existing-system-role',
		});
		transaction.socialAccounts.findUnique.mockResolvedValueOnce({
			googleId: 'other-google-identity',
			googleRefreshToken: 'existing-provider-refresh',
		});
		await expect(repository.connectGoogleAccount(google)).rejects.toMatchObject({
			status: 409,
		});
		expect(transaction.socialAccounts.upsert).not.toHaveBeenCalled();
	});
});
