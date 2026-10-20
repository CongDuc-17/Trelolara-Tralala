export interface AuthUser {
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

export interface AuthAccount {
	id: string;
	userId: string;
	password: string;
	salt: string;
	user: AuthUser;
}

export interface AccountSummary {
	id: string;
	userId: string;
	email: string;
	name: string;
	avatar: string;
	verify: boolean;
	status: AuthUser['status'];
}

export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
}

export interface GoogleAccountInput {
	googleId: string;
	email: string;
	name: string;
	avatar?: string;
	accessToken: string;
	refreshToken?: string;
}

export interface GoogleLoginPrincipal {
	socialAccountInformation: { userId: string };
}
