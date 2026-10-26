import type { ErrorRequestHandler } from 'express';

export const errorHandlerMiddleware: ErrorRequestHandler = (
	error: unknown,
	_req,
	res,
	next,
) => {
	if (res.headersSent) return next(error);
	const details =
		error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
	const candidate = details.status ?? details.statusCode;
	let status =
		typeof candidate === 'number' && candidate >= 400 && candidate < 600
			? candidate
			: 500;
	let message =
		status < 500 && typeof details.message === 'string'
			? details.message
			: 'Internal server error';
	const publicCodes = [
		'MAIL_DELIVERY_FAILED',
		'REGISTRATION_PENDING',
		'EMAIL_EXISTS',
		'OTP_COOLDOWN',
		'ACCOUNT_UNVERIFIED',
	];
	const code =
		typeof details.code === 'string' && publicCodes.includes(details.code)
			? details.code
			: undefined;
	if (code === 'MAIL_DELIVERY_FAILED')
		message = 'Email could not be delivered. Please try again later.';
	if (code === 'REGISTRATION_PENDING')
		message =
			'Your account is awaiting email verification. Please request a verification code.';
	if (details.code === 'P2002') {
		status = 409;
		message = 'Resource already exists';
	} else if (details.code === 'P2025') {
		status = 404;
		message = 'Resource not found';
	}
	if (status >= 500) {
		console.error('[ErrorHandler]', error);
	}
	res.status(status).json({
		success: false,
		message,
		...(code ? { code } : {}),
		...(code === 'OTP_COOLDOWN' &&
		typeof details.retryAfterSeconds === 'number' &&
		Number.isInteger(details.retryAfterSeconds) &&
		details.retryAfterSeconds > 0
			? { retryAfterSeconds: details.retryAfterSeconds }
			: {}),
	});
};
