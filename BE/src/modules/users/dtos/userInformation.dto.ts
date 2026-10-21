import { UserStatusEnum } from '@prisma/client';

import { UserProfile } from '../users.types';

export class UserInformationDto {
	id: string;
	email: string;
	name: string;
	bio: string | null;
	address: string | null;
	avatar: string | null;
	verify: boolean;
	status: UserStatusEnum;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;

	constructor(user: UserProfile) {
		this.id = user.id;
		this.email = user.email;
		this.name = user.name;
		this.bio = user.bio ?? null;
		this.address = user.address ?? null;
		this.avatar = user.avatar ?? null;
		this.verify = user.verify;
		this.status = user.status;
		this.createdAt = user.createdAt;
		this.updatedAt = user.updatedAt;
		this.deletedAt = user.deletedAt ?? null;
	}
}
