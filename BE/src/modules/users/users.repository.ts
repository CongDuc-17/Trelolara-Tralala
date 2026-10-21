import { prisma as database, runInTransaction, type DatabaseClient } from '../database';

import { UpdateProfileInput, UserProfile } from './users.types';

export class UsersRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async findUsers({
		name,
		status,
		skip,
		take,
	}: {
		name?: string;
		status?: UserProfile['status'];
		skip: number;
		take: number;
	}): Promise<[UserProfile[], number]> {
		return Promise.all([
			this.prismaService.users.findMany({
				where: {
					name: name,
					status: status,
				},
				skip: skip,
				take: take,
			}),
			this.prismaService.users.count({
				where: {
					name: name,
					status: status,
				},
			}),
		]);
	}

	async findUser(
		{
			userId,
			email,
			userStatus,
		}: {
			userId?: string;
			email?: string;
			userStatus?: UserProfile['status'];
		},
		client: DatabaseClient = this.prismaService,
	): Promise<UserProfile | null> {
		return client.users.findFirst({
			where: {
				id: userId,
				email: email,
				status: userStatus,
			},
		});
	}

	async updateUser({
		userId,
		user,
	}: {
		userId: string;
		user: UpdateProfileInput & { avatar?: string };
	}): Promise<UserProfile> {
		if (user.email !== undefined) {
			return runInTransaction(async (client) => {
				await client.$queryRaw`SELECT id FROM "Users" WHERE id = ${userId} FOR UPDATE`;
				const current = await client.users.findUnique({
					where: { id: userId },
					select: { email: true },
				});
				const emailChanged = current?.email !== user.email;
				// Verification and OTP belong to the address; neither survives an address change.
				if (emailChanged) await client.otps.deleteMany({ where: { userId } });
				return client.users.update({
					where: { id: userId },
					data: { ...user, ...(emailChanged ? { verify: false } : {}) },
				});
			}, this.prismaService);
		}
		return this.prismaService.users.update({
			where: { id: userId },
			data: user,
		});
	}
}
