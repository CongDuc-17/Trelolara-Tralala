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
	readonly code = 'MAIL_DELIVERY_FAILED';

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
		let timer: ReturnType<typeof setTimeout> | undefined;
		const controller = new AbortController();
		const apiKey = process.env.BREVO_API_KEY?.trim();
		try {
			const sender = data.sender ?? this.sender ?? getMailSender();
			const send = async () => {
				if (!this.transporter && apiKey) {
					const response = await fetch('https://api.brevo.com/v3/smtp/email', {
						method: 'POST',
						headers: {
							'api-key': apiKey,
							'Content-Type': 'application/json',
							Accept: 'application/json',
						},
						signal: controller.signal,
						body: JSON.stringify({
							sender: { name: sender.name, email: sender.address },
							to: (Array.isArray(data.recipients)
								? data.recipients
								: [data.recipients]
							).map((email) => ({ email })),
							subject: data.subject,
							...(data.html !== undefined
								? { htmlContent: data.html }
								: { textContent: data.text }),
						}),
					});
					if (!response.ok)
						throw Object.assign(new Error('Brevo rejected email'), {
							code: 'BREVO_REJECTED',
							responseCode: response.status,
						});
					const result: unknown = await response.json();
					if (
						!result ||
						typeof result !== 'object' ||
						!('messageId' in result) ||
						typeof result.messageId !== 'string' ||
						!result.messageId
					) {
						throw Object.assign(new Error('Invalid Brevo response'), {
							code: 'BREVO_INVALID_RESPONSE',
						});
					}
					return;
				}
				if (!this.transporter && process.env.RENDER === 'true') {
					throw Object.assign(new Error('Configure BREVO_API_KEY on Render'), {
						code: 'BREVO_CONFIGURATION_MISSING',
					});
				}
				this.transporter ??= getMailTransporter();
				await this.transporter.sendMail({
					from: `${sender.name} <${sender.address}>`,
					to: data.recipients,
					subject: data.subject,
					...(data.html !== undefined ? { html: data.html } : {}),
					...(data.text !== undefined ? { text: data.text } : {}),
				});
			};
			await Promise.race([
				send(),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => {
						controller.abort();
						reject(
							Object.assign(new Error('Email delivery timed out'), {
								code: 'ETIMEDOUT',
							}),
						);
					}, 7000);
				}),
			]);
			return { success: true };
		} catch (error) {
			if (error instanceof MailDeliveryError) throw error;
			const details =
				error && typeof error === 'object'
					? (error as Record<string, unknown>)
					: {};
			const codes = [
				'EAUTH',
				'ETIMEDOUT',
				'EDNS',
				'ECONNECTION',
				'ESOCKET',
				'ECONNRESET',
				'ECONNREFUSED',
				'BREVO_REJECTED',
				'BREVO_INVALID_RESPONSE',
				'BREVO_CONFIGURATION_MISSING',
			];
			console.error('[MailsService] Email delivery failed', {
				provider: apiKey ? 'brevo' : 'smtp',
				code:
					typeof details.code === 'string' && codes.includes(details.code)
						? details.code
						: 'UNKNOWN',
				...(typeof details.responseCode === 'number'
					? { responseCode: details.responseCode }
					: {}),
			});
			throw new MailDeliveryError();
		} finally {
			clearTimeout(timer);
		}
	}
}

export { MailsService as MailService };
