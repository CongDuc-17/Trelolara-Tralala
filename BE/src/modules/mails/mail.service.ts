import type { SendMailOptions } from 'nodemailer';
import { SendEmailDto } from './dtos';
import {
	getMailSender,
	getMailTransporter,
	type MailSender,
} from '@/configs/mails.config';

export interface MailTransporter {
	sendMail(options: SendMailOptions): Promise<unknown>;
}

export class MailDeliveryError extends Error {
	readonly status = 503;

	constructor() {
		super('Email could not be delivered. Please try again later.');
		this.name = 'MailDeliveryError';
	}
}

export class MailsService {
	constructor(
		private transporter?: MailTransporter,
		private readonly sender?: MailSender,
	) {}

	async sendEmail(data: SendEmailDto): Promise<{ success: true }> {
		try {
			const sender = data.sender ?? this.sender ?? getMailSender();
			const from = `${sender.name} <${sender.address}>`;
			this.transporter ??= getMailTransporter();
			await this.transporter.sendMail({
				from,
				to: data.recipients,
				subject: data.subject,
				...(data.html !== undefined ? { html: data.html } : {}),
				...(data.text !== undefined ? { text: data.text } : {}),
			});
			return { success: true };
		} catch (error) {
			if (error instanceof MailDeliveryError) throw error;
			const sanitized = error instanceof Error
				? error.message.replace(/([a-zA-Z0-9_\s-]*pass(word)?\s*[:=]\s*)[^\s,]+/gi, '$1***').replace(/\b\d{6}\b/g, '******')
				: 'Unknown delivery error';
			console.error('[MailsService] Email delivery failed:', sanitized);
			throw new MailDeliveryError();
		}
	}
}

export { MailsService as MailService };


