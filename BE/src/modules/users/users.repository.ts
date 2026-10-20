import { Prisma, UserStatusEnum } from '@prisma/client';

import { prisma as database, type DatabaseClient } from '../database';

import { users } from '@prisma/client';

export class UsersRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async findUsers({
		name,
		status,
		skip,
		take,
	}: {
		name?: string;
		status?: UserStatusEnum;
		skip: number;
		take: number;
	}): Promise<[users[], number]> {
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

	async findUser({
		userId,
		email,
		userStatus,
	}: {
		userId?: string;
		email?: string;
		userStatus?: UserStatusEnum;
	}): Promise<users | null> {
		return this.prismaService.users.findFirst({
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
		user: Prisma.usersUpdateManyMutationInput;
	}): Promise<users> {
		const { id, ...userData } = user;
		return this.prismaService.users.update({
			where: { id: userId },
			data: userData,
		});
	}
}
