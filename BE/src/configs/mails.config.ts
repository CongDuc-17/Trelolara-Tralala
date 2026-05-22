// import { Resend } from 'resend';

// export const MailConfig = {
// 	apiKey: String(process.env.RESEND_API_KEY),

// 	senderAddress:
// 		String(process.env.MAIL_SENDER_ADDRESS) ||
// 		'onboarding@resend.dev',

// 	senderName:
// 		String(process.env.MAIL_SENDER_NAME) ||
// 		'No Reply',
// };

// export const ResendConfig = new Resend(
// 	MailConfig.apiKey
// );

import * as nodemailer from 'nodemailer';

export const MailConfig = {
	smtpLogin: String(process.env.BREVO_SMTP_LOGIN),
	smtpKey: String(process.env.BREVO_SMTP_KEY),

	senderAddress:
		String(process.env.MAIL_SENDER_ADDRESS) ||
		'no-reply@localhost.com',

	senderName:
		String(process.env.MAIL_SENDER_NAME) ||
		'No Reply',
};

// Khởi tạo Transporter của Nodemailer với cấu hình Brevo SMTP
export const TransporterConfig = nodemailer.createTransport({
	host: 'smtp-relay.brevo.com',
	port: 587,
	secure: false, // Port 587 sử dụng TLS
	auth: {
		user: MailConfig.smtpLogin,
		pass: MailConfig.smtpKey,
	},
});