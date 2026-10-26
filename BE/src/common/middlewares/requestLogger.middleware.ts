import morgan from 'morgan';
import type { Request } from 'express';
import { appEnv } from '@/configs/app.config';

export function redactInvitationTokens(url: string): string {
	return url
		.replace(
			/([?&](?:code|state|access_token|refresh_token|id_token)=)[^&#\s]*/gi,
			'$1[redacted]',
		)
		.replace(
			/(\/invitations\/)[^/?#]+(\/(?:accept|reject))(?=[?#]|$)/gi,
			'$1[redacted]$2',
		)
		.replace(/(\/invite\/(?:projects|boards)\/)[^/?#]+/gi, '$1[redacted]');
}

morgan.token<Request>('safe-url', (req) =>
	redactInvitationTokens(req.originalUrl ?? req.url ?? ''),
);
morgan.token<Request>('safe-referrer', (req) =>
	redactInvitationTokens(String(req.headers.referer ?? req.headers.referrer ?? '')),
);
export const requestLoggerMiddleware = morgan(
	':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":safe-referrer" ":user-agent"',
	{ skip: () => appEnv.NODE_ENV === 'test' },
);
