import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface MailSender {
	address: string;
	name: string;
}

export function getMailSender(): MailSender {
	const address = (process.env.MAIL_SENDER_ADDRESS || process.env.GMAIL_USER)?.trim();
	if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
		throw new Error('Mail sender configuration is invalid');
	}
	return {
		address,
		name: process.env.MAIL_SENDER_NAME?.trim() || 'No Reply',
	};
}

let cachedTransporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

export function getMailTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
	if (cachedTransporter) return cachedTransporter;

	const user = process.env.GMAIL_USER?.trim();
	const pass = process.env.GMAIL_APP_PASSWORD?.trim();

	if (!user || !pass) {
		throw new Error('Gmail SMTP configuration is incomplete');
	}

	cachedTransporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		dnsTimeout: 3000,
		connectionTimeout: 3000,
		greetingTimeout: 3000,
		socketTimeout: 3000,
		auth: {
			user,
			pass,
		},
	});

	return cachedTransporter;
}

export function resetMailTransporter(): void {
	cachedTransporter = null;
}
