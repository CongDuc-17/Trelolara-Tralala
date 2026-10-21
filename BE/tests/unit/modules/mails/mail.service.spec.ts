import nodemailer from 'nodemailer';
import { MailsService, MailDeliveryError } from '@/modules/mails/mail.service';
import {
	getMailSender,
	getMailTransporter,
	resetMailTransporter,
} from '@/configs/mails.config';

jest.mock('nodemailer', () => ({
	createTransport: jest.fn(),
}));

const sender = { address: 'sender@example.test', name: 'Task Management' };
const message = {
	recipients: 'recipient@example.test',
	subject: 'Verify your email',
	text: 'Verification code: 123456',
};

describe('MailsService', () => {
	beforeEach(() => {
		resetMailTransporter();
		jest.clearAllMocks();
	});

	it('does not create a mail transporter when constructed', () => {
		new MailsService();
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
	});

	it('sends through the injected transporter with the structured sender', async () => {
		const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg_123' });
		const mail = new MailsService({ sendMail }, sender);

		await expect(mail.sendEmail(message)).resolves.toEqual({ success: true });
		expect(sendMail).toHaveBeenCalledWith({
			from: `${sender.name} <${sender.address}>`,
			to: message.recipients,
			subject: message.subject,
			text: message.text,
		});
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
	});

	it('returns a sanitized error instead of leaking credentials, passwords, or OTP', async () => {
		const sendMail = jest
			.fn()
			.mockRejectedValue(
				new Error('SMTP auth failed; pass=secret-app-password code=123456'),
			);
		const mail = new MailsService({ sendMail }, sender);
		const error = await mail.sendEmail(message).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(MailDeliveryError);
		expect(error).toMatchObject({ status: 503 });
		expect(String(error)).not.toContain('secret-app-password');
		expect(String(error)).not.toContain('123456');
	});

	it('treats rejected sendMail promises as a failed delivery', async () => {
		const mail = new MailsService(
			{
				sendMail: jest.fn().mockRejectedValue(new Error('Connection timeout')),
			},
			sender,
		);
		await expect(mail.sendEmail(message)).rejects.toBeInstanceOf(MailDeliveryError);
	});

	it('validates Gmail SMTP configuration lazily without converting missing values to strings', async () => {
		const prevUser = process.env.GMAIL_USER;
		const prevPass = process.env.GMAIL_APP_PASSWORD;
		delete process.env.GMAIL_USER;
		delete process.env.GMAIL_APP_PASSWORD;
		try {
			expect(() => new MailsService()).not.toThrow();
			expect(() => getMailTransporter()).toThrow(
				'Gmail SMTP configuration is incomplete',
			);
			await expect(
				new MailsService(undefined, sender).sendEmail(message),
			).rejects.toBeInstanceOf(MailDeliveryError);
			expect(nodemailer.createTransport).not.toHaveBeenCalled();
		} finally {
			if (prevUser === undefined) delete process.env.GMAIL_USER;
			else process.env.GMAIL_USER = prevUser;
			if (prevPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
			else process.env.GMAIL_APP_PASSWORD = prevPass;
		}
	});

	it('does not silently use an invalid sender when environment configuration is missing', () => {
		const previousSender = process.env.MAIL_SENDER_ADDRESS;
		const previousUser = process.env.GMAIL_USER;
		delete process.env.MAIL_SENDER_ADDRESS;
		delete process.env.GMAIL_USER;
		try {
			expect(getMailSender).toThrow('Mail sender configuration is invalid');
		} finally {
			if (previousSender === undefined) delete process.env.MAIL_SENDER_ADDRESS;
			else process.env.MAIL_SENDER_ADDRESS = previousSender;
			if (previousUser === undefined) delete process.env.GMAIL_USER;
			else process.env.GMAIL_USER = previousUser;
		}
	});

	it('reuses a singleton transporter across multiple getMailTransporter calls', () => {
		const mockTransporter = { sendMail: jest.fn() };
		(nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
		process.env.GMAIL_USER = 'sender@gmail.com';
		process.env.GMAIL_APP_PASSWORD = 'app-password';

		const first = getMailTransporter();
		const second = getMailTransporter();

		expect(first).toBe(second);
		expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
		expect(nodemailer.createTransport).toHaveBeenCalledWith({
			host: 'smtp.gmail.com',
			port: 465,
			secure: true,
			auth: {
				user: 'sender@gmail.com',
				pass: 'app-password',
			},
		});
	});

	it('falls back to GMAIL_USER as sender address if MAIL_SENDER_ADDRESS is not set', () => {
		const prevSender = process.env.MAIL_SENDER_ADDRESS;
		const prevUser = process.env.GMAIL_USER;
		delete process.env.MAIL_SENDER_ADDRESS;
		process.env.GMAIL_USER = 'fallback@gmail.com';
		try {
			const s = getMailSender();
			expect(s.address).toBe('fallback@gmail.com');
		} finally {
			if (prevSender === undefined) delete process.env.MAIL_SENDER_ADDRESS;
			else process.env.MAIL_SENDER_ADDRESS = prevSender;
			if (prevUser === undefined) delete process.env.GMAIL_USER;
			else process.env.GMAIL_USER = prevUser;
		}
	});
});

