import type { NextFunction, Request, Response } from 'express';
import { errorHandlerMiddleware } from '@/common/middlewares/errorHandler.middleware';
import { MailDeliveryError } from '@/modules/mails/mail.service';
import { OtpCooldownError } from '@/modules/otps/otps.service';

function handle(error: unknown) {
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	const response = { headersSent: false, status: jest.fn(), json: jest.fn() };
	response.status.mockReturnValue(response);
	errorHandlerMiddleware(
		error,
		{} as Request,
		response as unknown as Response,
		jest.fn() as NextFunction,
	);
	return response;
}

it('exposes only safe mail failure details for frontend recovery', () => {
	const response = handle(new MailDeliveryError());
	expect(response.status).toHaveBeenCalledWith(503);
	expect(response.json).toHaveBeenCalledWith({
		success: false,
		code: 'MAIL_DELIVERY_FAILED',
		message: 'Email could not be delivered. Please try again later.',
	});
});

it('returns the exact OTP retry delay without private error fields', () => {
	const response = handle(
		Object.assign(new OtpCooldownError(240), {
			otp: '123456',
			userId: 'private-user',
		}),
	);
	expect(response.status).toHaveBeenCalledWith(409);
	expect(response.json).toHaveBeenCalledWith({
		success: false,
		code: 'OTP_COOLDOWN',
		retryAfterSeconds: 240,
		message: 'OTP sẽ được cấp lại sau 240 giây',
	});
});

it('keeps unknown server errors private and never copies arbitrary error codes', () => {
	const response = handle(
		Object.assign(new Error('private SQL or credentials'), {
			status: 503,
			code: 'private-code',
			retryAfterSeconds: 100,
		}),
	);
	expect(response.json).toHaveBeenCalledWith({
		success: false,
		message: 'Internal server error',
	});
});

it('gives a recoverable response when registration was saved but email failed', () => {
	const response = handle(
		Object.assign(new Error('private provider failure'), {
			status: 503,
			code: 'REGISTRATION_PENDING',
		}),
	);
	expect(response.json).toHaveBeenCalledWith({
		success: false,
		code: 'REGISTRATION_PENDING',
		message:
			'Your account is awaiting email verification. Please request a verification code.',
	});
});
