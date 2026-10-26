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
	it('does not log an invitation token returned in a provider error', async () => {
		const token = 'a'.repeat(64);
		const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const mail = new MailsService(
			{
				sendMail: jest
					.fn()
					.mockRejectedValue(
						new Error('Rejected https://frontend.example/invite/' + token),
					),
			},
			sender,
		);
		await expect(mail.sendEmail(message)).rejects.toBeInstanceOf(MailDeliveryError);
		expect(log.mock.calls.flat().join(' ')).not.toContain(token);
	});
	beforeEach(() => {
		resetMailTransporter();
		jest.clearAllMocks();
		process.env.BREVO_API_KEY = '';
		process.env.RENDER = '';
		jest.spyOn(globalThis, 'fetch').mockRejectedValue(
			new Error('Unmocked fetch blocked'),
		);
	});
	afterEach(() => {
		process.env.BREVO_API_KEY = '';
		process.env.RENDER = '';
		jest.useRealTimers();
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
			dnsTimeout: 3000,
			connectionTimeout: 3000,
			greetingTimeout: 3000,
			socketTimeout: 3000,
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

	it('sends OTP and invitation content through Brevo HTTPS without opening SMTP', async () => {
		process.env.BREVO_API_KEY = 'isolated-test-api-key';
		jest.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ messageId: 'mail-1' }), { status: 201 }),
		);
		await expect(
			new MailsService(undefined, sender).sendEmail({
				...message,
				recipients: ['one@example.test', 'two@example.test'],
				html: '<p>123456</p>',
			}),
		).resolves.toEqual({ success: true });
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
		const [url, options] = jest.mocked(fetch).mock.calls[0];
		expect(url).toBe('https://api.brevo.com/v3/smtp/email');
		expect(options).toMatchObject({
			method: 'POST',
			headers: { 'api-key': 'isolated-test-api-key' },
			signal: expect.any(AbortSignal),
		});
		expect(JSON.parse(String(options?.body))).toEqual({
			sender: { email: sender.address, name: sender.name },
			to: [{ email: 'one@example.test' }, { email: 'two@example.test' }],
			subject: message.subject,
			htmlContent: '<p>123456</p>',
		});
	});

	it.each([400, 401, 429, 500])(
		'keeps a rejected Brevo response %s private while logging its status',
		async (status) => {
			process.env.BREVO_API_KEY = 'isolated-test-api-key';
			const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
			jest.mocked(fetch).mockResolvedValue(
				new Response('private-token-and-recipient', { status }),
			);
			await expect(
				new MailsService(undefined, sender).sendEmail(message),
			).rejects.toMatchObject({ status: 503, code: 'MAIL_DELIVERY_FAILED' });
			expect(log).toHaveBeenCalledWith('[MailsService] Email delivery failed', {
				provider: 'brevo',
				code: 'BREVO_REJECTED',
				responseCode: status,
			});
			expect(JSON.stringify(log.mock.calls)).not.toContain(
				'private-token-and-recipient',
			);
		},
	);

	it('rejects a Brevo success response without a message ID', async () => {
		process.env.BREVO_API_KEY = 'isolated-test-api-key';
		jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 201 }));
		await expect(
			new MailsService(undefined, sender).sendEmail(message),
		).rejects.toBeInstanceOf(MailDeliveryError);
	});

	it('fails fast on Render without Brevo configuration instead of trying blocked SMTP', async () => {
		process.env.RENDER = 'true';
		const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		await expect(
			new MailsService(undefined, sender).sendEmail(message),
		).rejects.toMatchObject({ status: 503 });
		expect(nodemailer.createTransport).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			'[MailsService] Email delivery failed',
			expect.objectContaining({ code: 'BREVO_CONFIGURATION_MISSING' }),
		);
	});

	it('aborts a hung HTTPS send within seven seconds', async () => {
		jest.useFakeTimers();
		process.env.BREVO_API_KEY = 'isolated-test-api-key';
		jest.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
		const pending = expect(
			new MailsService(undefined, sender).sendEmail(message),
		).rejects.toMatchObject({ status: 503 });
		await jest.advanceTimersByTimeAsync(7000);
		await pending;
		expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('bounds an injected SMTP send and logs only allowed diagnostic fields', async () => {
		const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		await expect(
			new MailsService(
				{
					sendMail: jest
						.fn()
						.mockRejectedValue(
							Object.assign(new Error('private OTP 123456'), {
								code: 'EAUTH',
								responseCode: 535,
								response: 'private-password',
							}),
						),
				},
				sender,
			).sendEmail(message),
		).rejects.toBeInstanceOf(MailDeliveryError);
		expect(log).toHaveBeenCalledWith('[MailsService] Email delivery failed', {
			provider: 'smtp',
			code: 'EAUTH',
			responseCode: 535,
		});
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/123456|private-password/);
		jest.useFakeTimers();
		const pending = expect(
			new MailsService(
				{ sendMail: () => new Promise(() => undefined) },
				sender,
			).sendEmail(message),
		).rejects.toMatchObject({ status: 503 });
		await jest.advanceTimersByTimeAsync(7000);
		await pending;
	});
});
