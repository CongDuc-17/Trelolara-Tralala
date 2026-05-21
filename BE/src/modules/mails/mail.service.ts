import { SendMailOptions } from 'nodemailer';
import { SendEmailDto } from './dtos';
import { MailConfig, TransporterConfig } from '@/configs/mails.config';

export class MailsService {
	constructor() {}

	async sendEmail(
		data: SendEmailDto
	): Promise<{ success: boolean } | null> {
		try {
			const { sender, recipients, subject, html, text } = data;

			// Nodemailer bọc tên người gửi trong ngoặc kép "" để hiển thị tốt nhất
			const fromAddress = sender
				? `"${sender.name}" <${sender.address}>`
				: `"${MailConfig.senderName}" <${MailConfig.senderAddress}>`;

			// Ép kiểu sang SendMailOptions của Nodemailer
			const payload: SendMailOptions = {
				from: fromAddress,
				to: recipients, 
				subject,
				...(html && { html }), 
				...(text && { text }), 
			};

			// Sử dụng transporter thay vì ResendConfig
			await TransporterConfig.sendMail(payload);

			return { success: true };
		} catch (error) {
			console.error('[MAIL_SERVICE_ERROR]', error);
			return null;
		}
	}
}