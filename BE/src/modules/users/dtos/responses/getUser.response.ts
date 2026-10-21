import { UserStatusEnum } from '@prisma/client';
import z from 'zod';

import { UserProfile } from '../../users.types';

export class GetUserResponseDto {
	id: string;
	email: string;
	name: string;
	avatar: string | null | undefined;
	createdAt: Date | null | undefined;
	updatedAt: Date | null | undefined;
	deletedAt: Date | null | undefined;
	status: UserStatusEnum;
	address: string | null | undefined;
	bio: string | null | undefined;

	constructor(userInformation: UserProfile) {
		this.id = userInformation.id;
		this.email = userInformation.email;
		this.name = userInformation.name;
		this.avatar = userInformation.avatar;
		this.createdAt = userInformation.createdAt;
		this.updatedAt = userInformation.updatedAt;
		this.deletedAt = userInformation.deletedAt;
		this.status = userInformation.status;
		this.address = userInformation.address;
		this.bio = userInformation.bio;
	}
}

export const getUserResponseDtoSchema = z.object({
	id: z.uuid(),
	email: z.email(),
	name: z.string(),
	avatar: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
	deletedAt: z.date().nullable(),
	status: z.enum(UserStatusEnum),
	address: z.string().nullable(),
	bio: z.string().nullable(),
});
