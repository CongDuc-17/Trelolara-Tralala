import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function attachmentFile(extension = 'png') {
	const mimeTypes: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		webp: 'image/webp',
		pdf: 'application/pdf',
	};
	return {
		buffer: readFileSync(join(__dirname, 'attachments', `sample.${extension}`)),
		originalname: `sample.${extension}`,
		mimetype: mimeTypes[extension],
	};
}
