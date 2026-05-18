import { CreateEmailOptions } from 'resend';
import { SendEmailDto } from './dtos';
import { MailConfig, ResendConfig } from '@/configs/mails.config';

export class MailsService {
	constructor() {}

	async sendEmail(
		data: SendEmailDto
	): Promise<{ success: boolean } | null> {
		try {
			const { sender, recipients, subject, html, text } = data;

			const fromAddress = sender
				? `${sender.name} <${sender.address}>`
				: `${MailConfig.senderName} <${MailConfig.senderAddress}>`;

			// SỬA Ở ĐÂY: Khởi tạo toàn bộ payload cùng 1 lúc và ép kiểu
			const payload = {
				from: fromAddress,
				to: recipients,
				subject,
				...(html && { html }), 
				...(text && { text }), 
			} as CreateEmailOptions;

			await ResendConfig.emails.send(payload);

			return { success: true };
		} catch (error) {
			console.error('[MAIL_SERVICE_ERROR]', error);
			return null;
		}
	}
}