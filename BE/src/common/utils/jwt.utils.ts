import { randomUUID } from 'node:crypto';

import { decode, sign, verify } from 'jsonwebtoken';

import { UnauthorizedException } from '../exceptions';
import { ITokenPayload } from '../interfaces/tokenPayload.interface';

import { jwtConfig } from '@/configs/jwt.config';
import { SessionTokens } from '@/modules/auth/auth.types';

export const signJWT = async (payload: { userId: string }): Promise<SessionTokens> => ({
	accessToken: sign({ ...payload, tokenType: 'access' }, jwtConfig.secretAccessToken, {
		algorithm: 'HS256',
		expiresIn: jwtConfig.expiresInAccessToken,
		jwtid: randomUUID(),
	}),
	refreshToken: sign(
		{ ...payload, tokenType: 'refresh' },
		jwtConfig.secretRefreshToken,
		{
			algorithm: 'HS256',
			expiresIn: jwtConfig.expiresInRefreshToken,
			jwtid: randomUUID(),
		},
	),
});

const verifyToken = (
	rawToken: string,
	secret: string,
	tokenType: 'access' | 'refresh',
): ITokenPayload => {
	try {
		const payload = verify(rawToken, secret, { algorithms: ['HS256'] });
		if (
			typeof payload !== 'object' ||
			typeof payload.userId !== 'string' ||
			!payload.userId ||
			typeof payload.exp !== 'number' ||
			typeof payload.iat !== 'number' ||
			(payload.tokenType !== undefined && payload.tokenType !== tokenType)
		) {
			throw new Error('Invalid token payload');
		}
		return payload as ITokenPayload;
	} catch {
		throw new UnauthorizedException('is invalid or expired');
	}
};

export const verifyAccessJWT = (rawToken: string): ITokenPayload =>
	verifyToken(rawToken, jwtConfig.secretAccessToken, 'access');

export const verifyRefreshJWT = (rawToken: string): ITokenPayload =>
	verifyToken(rawToken, jwtConfig.secretRefreshToken, 'refresh');

export const getTokenExpiry = (token: string): Date => {
	const payload = decode(token);
	if (!payload || typeof payload === 'string' || typeof payload.exp !== 'number') {
		throw new Error('Signed token has no expiry');
	}
	return new Date(payload.exp * 1000);
};
