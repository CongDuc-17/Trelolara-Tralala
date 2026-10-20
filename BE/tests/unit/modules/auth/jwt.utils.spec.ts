import { decode, sign } from 'jsonwebtoken';

import {
	getTokenExpiry,
	signJWT,
	verifyAccessJWT,
	verifyRefreshJWT,
} from '@/common/utils/jwt.utils';
import { jwtConfig } from '@/configs/jwt.config';

describe('JWT adapter', () => {
	it('creates unique access and refresh JWTs even within the same second', async () => {
		const [first, second] = await Promise.all([
			signJWT({ userId: 'user-1' }),
			signJWT({ userId: 'user-1' }),
		]);
		expect(first.accessToken).not.toBe(second.accessToken);
		expect(first.refreshToken).not.toBe(second.refreshToken);
		expect(verifyAccessJWT(first.accessToken)).toMatchObject({
			userId: 'user-1',
			tokenType: 'access',
			jti: expect.any(String),
		});
		expect(verifyRefreshJWT(first.refreshToken)).toMatchObject({
			userId: 'user-1',
			tokenType: 'refresh',
			jti: expect.any(String),
		});
		const payload = decode(first.refreshToken) as { exp: number };
		expect(getTokenExpiry(first.refreshToken).getTime()).toBe(payload.exp * 1000);
	});

	it('accepts legacy signed JWTs without type/jti claims until their existing expiry', () => {
		const legacy = sign({ userId: 'user-1' }, jwtConfig.secretRefreshToken, {
			expiresIn: '1h',
		});
		expect(verifyRefreshJWT(legacy)).toMatchObject({ userId: 'user-1' });
	});

	it.each([
		[
			'invalid-signature',
			() => sign({ userId: 'user-1' }, 'wrong-secret', { expiresIn: '1h' }),
		],
		[
			'expired',
			() =>
				sign({ userId: 'user-1' }, jwtConfig.secretRefreshToken, {
					expiresIn: -1,
				}),
		],
		[
			'missing-user',
			() => sign({}, jwtConfig.secretRefreshToken, { expiresIn: '1h' }),
		],
		[
			'wrong-type',
			() =>
				sign(
					{ userId: 'user-1', tokenType: 'access' },
					jwtConfig.secretRefreshToken,
					{ expiresIn: '1h' },
				),
		],
		[
			'unsupported-algorithm',
			() =>
				sign({ userId: 'user-1' }, jwtConfig.secretRefreshToken, {
					expiresIn: '1h',
					algorithm: 'HS384',
				}),
		],
	])('rejects %s refresh JWTs', (_name, createToken) => {
		expect(() => verifyRefreshJWT(createToken())).toThrow(
			expect.objectContaining({ status: 401 }),
		);
	});
});
