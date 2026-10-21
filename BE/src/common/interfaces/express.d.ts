import type { AuthUser } from '../../modules/auth/auth.types';

declare global {
	namespace Express {
		interface User extends Partial<AuthUser> {
			socialAccountInformation?: { userId: string };
		}
	}
}

export {};
