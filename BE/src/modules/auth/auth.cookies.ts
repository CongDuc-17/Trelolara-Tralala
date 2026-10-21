import type { CookieOptions, Request, Response } from 'express';
import { decode } from 'jsonwebtoken';

import { appEnv } from '@/configs/app.config';

const cookieOptions = (): CookieOptions => ({
	httpOnly: true,
	secure: appEnv.NODE_ENV === 'production',
	sameSite: appEnv.NODE_ENV === 'production' ? 'none' : 'lax',
	path: '/',
});

export function readCookie(
	req: Pick<Request, 'headers'>,
	name: string,
): string | undefined {
	const item = req.headers.cookie
		?.split(';')
		.map((value) => value.trim())
		.find((value) => value.startsWith(`${name}=`));
	if (!item) return undefined;
	try {
		return decodeURIComponent(item.slice(name.length + 1));
	} catch {
		return undefined;
	}
}

export function setAuthCookies(
	res: Response,
	tokens: { accessToken: string; refreshToken: string },
): void {
	for (const [name, token] of Object.entries(tokens)) {
		const payload = decode(token);
		const expires =
			payload && typeof payload === 'object' && typeof payload.exp === 'number'
				? new Date(payload.exp * 1000)
				: undefined;
		res.cookie(name, token, { ...cookieOptions(), ...(expires ? { expires } : {}) });
	}
}

export function clearAuthCookies(res: Response): void {
	for (const name of ['accessToken', 'refreshToken'])
		res.clearCookie(name, cookieOptions());
}
