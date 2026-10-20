import { Resend } from 'resend';

export interface MailSender {
	address: string;
	name: string;
}

export function getMailSender(): MailSender {
	const address = process.env.MAIL_SENDER_ADDRESS?.trim();
	if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
		throw new Error('Mail sender configuration is invalid');
	}
	return {
		address,
		name: process.env.MAIL_SENDER_NAME?.trim() || 'No Reply',
	};
}

export function createResendClient(): Resend {
	const apiKey = process.env.RESEND_API_KEY?.trim();
	if (!apiKey) {
		throw new Error('Resend configuration is incomplete');
	}
	return new Resend(apiKey);
}
