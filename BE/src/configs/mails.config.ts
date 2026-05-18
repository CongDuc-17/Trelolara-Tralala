import { Resend } from 'resend';

export const MailConfig = {
	apiKey: String(process.env.RESEND_API_KEY),

	senderAddress:
		String(process.env.MAIL_SENDER_ADDRESS) ||
		'onboarding@resend.dev',

	senderName:
		String(process.env.MAIL_SENDER_NAME) ||
		'No Reply',
};

export const ResendConfig = new Resend(
	MailConfig.apiKey
);