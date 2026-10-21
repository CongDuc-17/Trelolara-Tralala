import { prisma as database, type DatabaseClient } from '../database';

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

	async findUser({
		userId,
		email,
		userStatus,
	}: {
		userId?: string;
		email?: string;
		userStatus?: UserProfile['status'];
	}): Promise<UserProfile | null> {
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
		user: UpdateProfileInput & { avatar?: string };
	}): Promise<UserProfile> {
		return this.prismaService.users.update({
			where: { id: userId },
			data: user,
		});
	}
}
