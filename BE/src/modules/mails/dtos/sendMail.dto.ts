

export class SendEmailDto {
	sender?: {
		address: string;
		name: string;
	};
	recipients: string | string[];
	subject: string;
	html?: string| undefined;
	text?: string| undefined;
}
