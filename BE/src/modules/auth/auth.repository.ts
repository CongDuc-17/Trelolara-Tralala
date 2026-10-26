import { RoleStatusEnum, UserStatusEnum } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';

import { DatabaseClient, prisma, runInTransaction } from '../database';

import { AuthAccount, AuthUser, GoogleAccountInput } from './auth.types';

import { InternalServerException, OptionalException } from '@/common/exceptions';

export class AuthRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}

	inTransaction<T>(
		work: (repository: AuthRepository, client: DatabaseClient) => Promise<T>,
	): Promise<T> {
		return runInTransaction((tx) => work(new AuthRepository(tx), tx), this.client);
	}

	async lockUser(userId: string): Promise<void> {
		await this.client
			.$queryRaw`SELECT "id" FROM "Users" WHERE "id" = ${userId} FOR UPDATE`;
	}

	findUser(input: { userId?: string; email?: string }): Promise<AuthUser | null> {
		return this.client.users.findFirst({
			where: { id: input.userId, email: input.email, deletedAt: null },
		});
	}

	findAccount({
		accountId,
		userId,
		email,
		userStatus,
	}: {
		accountId?: string;
		userId?: string;
		email: string;
		userStatus?: UserStatusEnum;
	}): Promise<AuthAccount | null> {
		return this.client.accounts.findFirst({
			include: { user: true },
			where: {
				id: accountId,
				user: { id: userId, email, status: userStatus, deletedAt: null },
			},
		});
	}

	createRegisteredAccount(input: {
		email: string;
		name: string;
		avatar: string;
		password: string;
		salt: string;
	}): Promise<AuthAccount> {
		return this.inTransaction(async (repository) => {
			const role = await repository.findDefaultRole();
			return repository.client.accounts.create({
				include: { user: true },
				data: {
					password: input.password,
					salt: input.salt,
					user: {
						create: {
							email: input.email,
							name: input.name,
							avatar: input.avatar,
							usersRoles: { create: { roleId: role.id } },
						},
					},
				},
			});
		});
	}

	async findVerificationAccount(
		email: string,
	): Promise<Pick<AuthAccount, 'id' | 'userId' | 'user'> | null> {
		const where = { user: { email, status: UserStatusEnum.ACTIVE, deletedAt: null } };
		const select = { id: true, userId: true, user: true } as const;
		const local = await this.client.accounts.findFirst({ where, select });
		if (local) return local;
		return this.client.socialAccounts.findFirst({ where, select });
	}

	private async findDefaultRole(): Promise<{ id: string }> {
		const role = await this.client.roles.findFirst({
			where: { name: 'USER', status: RoleStatusEnum.ACTIVE, deletedAt: null },
			select: { id: true },
		});
		if (!role) throw new InternalServerException();
		return role;
	}

	connectGoogleAccount(input: GoogleAccountInput): Promise<{ userId: string }> {
		return this.inTransaction(async (repository) => {
			let user = await repository.findUser({ email: input.email });
			if (user && user.status !== UserStatusEnum.ACTIVE) {
				throw new OptionalException(
					StatusCodes.FORBIDDEN,
					'Your account has been locked',
				);
			}
			if (!user) {
				const role = await repository.findDefaultRole();
				user = await repository.client.users.create({
					data: {
						email: input.email,
						name: input.name,
						avatar: input.avatar,
						verify: true,
						usersRoles: { create: { roleId: role.id } },
					},
				});
			} else {
				await repository.lockUser(user.id);
				user = await repository.findUser({ userId: user.id });
				if (
					!user ||
					user.status !== UserStatusEnum.ACTIVE ||
					user.email !== input.email
				) {
					throw new OptionalException(
						StatusCodes.FORBIDDEN,
						'Your account is unavailable',
					);
				}
				const systemRole = await repository.client.usersRoles.findFirst({
					where: {
						userId: user.id,
						role: {
							name: { in: ['USER', 'ADMIN'] },
							status: RoleStatusEnum.ACTIVE,
							deletedAt: null,
						},
					},
					select: { id: true },
				});
				if (!systemRole) {
					const role = await repository.findDefaultRole();
					await repository.client.usersRoles.upsert({
						where: { userId_roleId: { userId: user.id, roleId: role.id } },
						create: { userId: user.id, roleId: role.id },
						update: {},
					});
				}
				if (!user.verify) {
					// A password set before email ownership was proved must not survive Google verification.
					await repository.client.accounts.deleteMany({
						where: { userId: user.id },
					});
					await repository.client.otps.deleteMany({
						where: { userId: user.id },
					});
					await repository.revokeSessions(user.id);
					await repository.markVerified(user.id);
				}
			}
			const existing = await repository.client.socialAccounts.findUnique({
				where: { userId: user.id },
			});
			if (existing && existing.googleId !== input.googleId) {
				throw new OptionalException(
					StatusCodes.CONFLICT,
					'A different Google account is already linked',
				);
			}
			return repository.client.socialAccounts.upsert({
				where: { userId: user.id },
				create: {
					userId: user.id,
					googleId: input.googleId,
					googleAccessToken: input.accessToken,
					googleRefreshToken: input.refreshToken ?? '',
				},
				update: {
					googleAccessToken: input.accessToken,
					...(input.refreshToken
						? { googleRefreshToken: input.refreshToken }
						: {}),
				},
				select: { userId: true },
			});
		});
	}

	async upsertPassword(input: {
		userId: string;
		password: string;
		salt: string;
	}): Promise<void> {
		await this.client.accounts.upsert({
			where: { userId: input.userId },
			create: input,
			update: { password: input.password, salt: input.salt },
		});
	}

	async updatePassword({
		userId,
		password,
		salt,
	}: {
		userId: string;
		password: string;
		salt: string;
	}): Promise<AuthAccount> {
		await this.markVerified(userId);
		return this.client.accounts.upsert({
			include: { user: true },
			where: { userId },
			create: { userId, password, salt },
			update: { password, salt },
		});
	}

	markVerified(userId: string): Promise<AuthUser> {
		return this.client.users.update({
			where: { id: userId },
			data: { verify: true },
		});
	}

	async createSession(
		userId: string,
		refreshToken: string,
		expiresAt: Date,
	): Promise<void> {
		await this.client.tokens.create({ data: { userId, refreshToken, expiresAt } });
	}

	findSession(
		refreshToken: string,
	): Promise<{ userId: string; expiresAt: Date } | null> {
		return this.client.tokens.findUnique({
			where: { refreshToken },
			select: { userId: true, expiresAt: true },
		});
	}

	async consumeSession(userId: string, refreshToken: string): Promise<boolean> {
		const { count } = await this.client.tokens.deleteMany({
			where: { userId, refreshToken, expiresAt: { gt: new Date() } },
		});
		return count === 1;
	}

	async revokeSessions(userId: string): Promise<void> {
		await this.client.tokens.deleteMany({ where: { userId } });
	}
}
