export interface UserProfile {
	id: string;
	email: string;
	name: string;
	bio: string | null;
	address: string | null;
	avatar: string | null;
	verify: boolean;
	status: 'ACTIVE' | 'LOCKED';
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface UpdateProfileInput {
	name?: string;
	email?: string;
	bio?: string;
	address?: string;
}

export interface UserSearchInput {
	name?: string;
	status?: UserProfile['status'];
}

export interface UsersPage {
	items: UserProfile[];
	totalItems: number;
	page: number;
	limit: number;
}

export interface AvatarUpload {
	buffer: Buffer;
	mimetype: string;
}

export interface AvatarStorage {
	upload(
		buffer: Buffer,
		mimetype: string,
		folder: string,
	): Promise<{
		secure_url: string;
		public_id: string;
	}>;
	delete(publicId: string): Promise<unknown>;
	extractPublicId(url: string): string | null;
}
