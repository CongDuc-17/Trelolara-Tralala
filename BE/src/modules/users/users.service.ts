import { AuthService } from '../auth/auth.service';

import { UsersRepository } from './users.repository';
import {
	AvatarStorage,
	AvatarUpload,
	UpdateProfileInput,
	UserProfile,
	UserSearchInput,
	UsersPage,
} from './users.types';

import {
	ConflictException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
	uploadImageFromBuffer,
} from '@/common/utils/cloudinary.utils';

const avatarStorage: AvatarStorage = {
	upload: uploadImageFromBuffer,
	delete: deleteImageFromCloudinary,
	extractPublicId: (url) => extractPublicIdFromUrl(url, 'TrelloLike_Avatars'),
};

export class UsersService {
	constructor(
		private readonly usersRepository: Pick<
			UsersRepository,
			'findUser' | 'findUsers' | 'updateUser'
		> = new UsersRepository(),
		private readonly auth: Pick<AuthService, 'changePassword'> = new AuthService(),
		private readonly storage: AvatarStorage = avatarStorage,
	) {}

	async getUsers(
		input: UserSearchInput,
		pagination: { page: number; limit: number },
	): Promise<UsersPage> {
		const [items, totalItems] = await this.usersRepository.findUsers({
			...input,
			skip: (pagination.page - 1) * pagination.limit,
			take: pagination.limit,
		});
		return { items, totalItems, ...pagination };
	}

	async getUserByUserId(input: {
		userId: string;
		status?: UserProfile['status'];
	}): Promise<UserProfile> {
		const user = await this.usersRepository.findUser({
			userId: input.userId,
			userStatus: input.status,
		});
		if (!user) throw new NotFoundException('userId');
		return user;
	}

	async updateMyInformation(
		input: UpdateProfileInput,
		actorId: string,
		file?: AvatarUpload,
	): Promise<UserProfile> {
		const current = await this.getUserByUserId({ userId: actorId });
		const changes: UpdateProfileInput & { avatar?: string } = {};
		for (const key of ['name', 'email', 'bio', 'address'] as const) {
			if (input[key] !== undefined && input[key] !== current[key]) {
				changes[key] = input[key];
			}
		}
		const uploaded = file
			? await this.storage.upload(file.buffer, file.mimetype, 'TrelloLike_Avatars')
			: null;
		if (uploaded) changes.avatar = uploaded.secure_url;
		if (Object.keys(changes).length === 0) {
			throw new OptionalException(422, 'No fields to update');
		}

		let updated: UserProfile;
		try {
			updated = await this.usersRepository.updateUser({
				userId: actorId,
				user: changes,
			});
		} catch (error) {
			if (uploaded) await this.cleanupAvatar(uploaded.public_id);
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'P2002'
			) {
				throw new ConflictException('email');
			}
			throw error;
		}

		// The profile already committed; cleanup cannot roll it back or remove its new avatar.
		if (uploaded && current.avatar) {
			const oldPublicId = this.storage.extractPublicId(current.avatar);
			if (oldPublicId && oldPublicId !== uploaded.public_id) {
				await this.cleanupAvatar(oldPublicId);
			}
		}
		return updated;
	}

	async updateMyPassword(
		newPassword: string,
		actor: UserProfile,
	): Promise<UserProfile> {
		await this.auth.changePassword(actor.id, newPassword);
		return actor;
	}

	private async cleanupAvatar(publicId: string): Promise<void> {
		try {
			await this.storage.delete(publicId);
		} catch {
			// shortcut: cleanup is best effort, add persistent retries if orphan uploads need guaranteed removal.
			console.error('[Users] Avatar cleanup failed');
		}
	}
}
