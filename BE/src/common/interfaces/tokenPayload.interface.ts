export interface ITokenPayload {
	userId: string;
	iat: number;
	exp: number;
	jti?: string;
	tokenType?: 'access' | 'refresh';
}
