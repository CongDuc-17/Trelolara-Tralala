import type { ErrorRequestHandler } from 'express';

export const errorHandlerMiddleware: ErrorRequestHandler = (error: unknown, _req, res, next) => {
	if (res.headersSent) return next(error);
	const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
	const candidate = details.status ?? details.statusCode;
	let status = typeof candidate === 'number' && candidate >= 400 && candidate < 600 ? candidate : 500;
	let message = status < 500 && typeof details.message === 'string' ? details.message : 'Internal server error';
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
	res.status(status).json({ success: false, message });
};
