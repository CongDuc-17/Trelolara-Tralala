import { Resend } from 'resend';
import { MailsService, MailDeliveryError } from '@/modules/mails/mail.service';
import { createResendClient, getMailSender } from '@/configs/mails.config';

jest.mock('resend', () => ({ Resend: jest.fn() }));

const sender = { address: 'sender@example.test', name: 'Task Management' };
const message = {
	recipients: 'recipient@example.test',
	subject: 'Verify your email',
	text: 'Verification code: 123456',
};

describe('MailsService', () => {
	it('does not create a Resend client when constructed', () => {
		new MailsService();
		expect(Resend).not.toHaveBeenCalled();
	});

	it('sends through the injected client with the structured sender', async () => {
		const send = jest.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
		const mail = new MailsService({ emails: { send } }, sender);

		await expect(mail.sendEmail(message)).resolves.toEqual({ success: true });
		expect(send).toHaveBeenCalledWith({
			from: `${sender.name} <${sender.address}>`,
			to: message.recipients,
			subject: message.subject,
			text: message.text,
		});
		expect(Resend).not.toHaveBeenCalled();
	});

	it('returns a sanitized error instead of leaking API keys or content', async () => {
		const send = jest
			.fn()
			.mockRejectedValue(new Error('Resend api-key-secret failed; code=123456'));
		const mail = new MailsService({ emails: { send } }, sender);
		const error = await mail.sendEmail(message).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(MailDeliveryError);
		expect(error).toMatchObject({ status: 503 });
		expect(String(error)).not.toContain('api-key-secret');
		expect(String(error)).not.toContain('123456');
	});

	it('treats error responses as a failed delivery', async () => {
		const mail = new MailsService(
			{
				emails: {
					send: jest.fn().mockResolvedValue({
						data: null,
						error: { message: 'Invalid domain', name: 'validation_error' },
					}),
				},
			},
			sender,
		);
		await expect(mail.sendEmail(message)).rejects.toBeInstanceOf(MailDeliveryError);
	});

	it('validates Resend configuration lazily without converting missing values to strings', async () => {
		const previousKey = process.env.RESEND_API_KEY;
		delete process.env.RESEND_API_KEY;
		try {
			expect(() => new MailsService()).not.toThrow();
			expect(() => createResendClient()).toThrow(
				'Resend configuration is incomplete',
			);
			await expect(
				new MailsService(undefined, sender).sendEmail(message),
			).rejects.toBeInstanceOf(MailDeliveryError);
			expect(Resend).not.toHaveBeenCalled();
		} finally {
			if (previousKey === undefined) delete process.env.RESEND_API_KEY;
			else process.env.RESEND_API_KEY = previousKey;
		}
	});

	it('does not silently use an invalid sender when environment configuration is missing', () => {
		const previousSender = process.env.MAIL_SENDER_ADDRESS;
		delete process.env.MAIL_SENDER_ADDRESS;
		try {
			expect(getMailSender).toThrow('Mail sender configuration is invalid');
		} finally {
			if (previousSender === undefined) delete process.env.MAIL_SENDER_ADDRESS;
			else process.env.MAIL_SENDER_ADDRESS = previousSender;
		}
	});
});
