import type { CreateEmailOptions } from 'resend';
import { SendEmailDto } from './dtos';
import {
	createResendClient,
	getMailSender,
	type MailSender,
} from '@/configs/mails.config';

export interface ResendClient {
	emails: {
		send(payload: CreateEmailOptions): Promise<{ data: unknown; error: unknown }>;
	};
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
		private client?: ResendClient,
		private readonly sender?: MailSender,
	) {}

	async sendEmail(data: SendEmailDto): Promise<{ success: true }> {
		try {
			const sender = data.sender ?? this.sender ?? getMailSender();
			const from = `${sender.name} <${sender.address}>`;
			this.client ??= createResendClient();
			const payload = {
				from,
				to: data.recipients,
				subject: data.subject,
				...(data.html !== undefined ? { html: data.html } : {}),
				...(data.text !== undefined ? { text: data.text } : {}),
			} as CreateEmailOptions;
			const response = await this.client.emails.send(payload);
			if (response.error) {
				console.error('[MailsService] Resend send error:', response.error);
				throw new MailDeliveryError();
			}
			return { success: true };
		} catch (error) {
			if (error instanceof MailDeliveryError) throw error;
			console.error('[MailsService] Email delivery failed:', error);
			throw new MailDeliveryError();
		}
	}
}

export { MailsService as MailService };

