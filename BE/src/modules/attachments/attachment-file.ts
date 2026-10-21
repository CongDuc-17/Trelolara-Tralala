import { posix } from 'node:path';
import { OptionalException } from '@/common/exceptions';
import {
	MAX_ATTACHMENT_BYTES,
	type AttachmentFile,
	type ValidatedAttachment,
} from './attachments.types';

function png(buffer: Buffer): boolean {
	if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
		return false;
	let offset = 8;
	let hasData = false;
	while (offset + 12 <= buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString('ascii', offset + 4, offset + 8);
		if (length > buffer.length - offset - 12) return false;
		if (
			offset === 8 &&
			(type !== 'IHDR' ||
				length !== 13 ||
				!buffer.readUInt32BE(16) ||
				!buffer.readUInt32BE(20))
		)
			return false;
		if (type === 'IDAT' && length > 0) hasData = true;
		offset += length + 12;
		if (type === 'IEND') return length === 0 && hasData && offset === buffer.length;
	}
	return false;
}
function jpeg(buffer: Buffer): boolean {
	if (buffer.readUInt16BE(0) !== 0xffd8) return false;
	let offset = 2;
	let hasFrame = false;
	let hasScan = false;
	while (offset < buffer.length) {
		if (buffer[offset++] !== 0xff) return false;
		while (buffer[offset] === 0xff) offset++;
		const marker = buffer[offset++];
		if (marker === 0xd9) return hasFrame && hasScan && offset === buffer.length;
		if (
			marker === 0 ||
			marker === 0xd8 ||
			(marker >= 0xd0 && marker <= 0xd7) ||
			offset + 2 > buffer.length
		)
			return false;
		const length = buffer.readUInt16BE(offset);
		if (length < 2 || offset + length > buffer.length) return false;
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			if (
				length < 8 ||
				!buffer.readUInt16BE(offset + 3) ||
				!buffer.readUInt16BE(offset + 5)
			)
				return false;
			hasFrame = true;
		}
		offset += length;
		if (marker === 0xda) {
			hasScan = true;
			while (offset < buffer.length) {
				if (buffer[offset] !== 0xff) {
					offset++;
					continue;
				}
				const next = buffer[offset + 1];
				if (next === 0 || (next >= 0xd0 && next <= 0xd7)) offset += 2;
				else break;
			}
		}
	}
	return false;
}
function webp(buffer: Buffer): boolean {
	if (
		buffer.toString('ascii', 0, 4) !== 'RIFF' ||
		buffer.toString('ascii', 8, 12) !== 'WEBP' ||
		buffer.readUInt32LE(4) !== buffer.length - 8
	)
		return false;
	let offset = 12;
	let hasImage = false;
	while (offset + 8 <= buffer.length) {
		const type = buffer.toString('ascii', offset, offset + 4);
		const length = buffer.readUInt32LE(offset + 4);
		if (!length || length > buffer.length - offset - 8) return false;
		if (type === 'VP8 ' || type === 'VP8L' || type === 'ANMF') hasImage = true;
		offset += 8 + length + (length % 2);
	}
	return hasImage && offset === buffer.length;
}
function pdf(buffer: Buffer): boolean {
	return (
		/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(buffer.toString('ascii', 0, 10)) &&
		/startxref\s+\d+\s+%%EOF\s*$/.test(buffer.subarray(-2048).toString('latin1')) &&
		/\d+\s+\d+\s+obj\b/.test(buffer.toString('latin1'))
	);
}

// shortcut: checks container structure without full decoding; add decoding before inline previews.
export function validateAttachmentFile(file?: AttachmentFile): ValidatedAttachment {
	if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
		throw new OptionalException(422, 'One non-empty file is required');
	if (file.buffer.length > MAX_ATTACHMENT_BYTES)
		throw new OptionalException(413, 'Attachment exceeds 10 MiB');
	const buffer = file.buffer;
	const format =
		buffer.length < 12
			? null
			: png(buffer)
				? { mimeType: 'image/png', extension: 'png' }
				: jpeg(buffer)
					? { mimeType: 'image/jpeg', extension: 'jpg' }
					: webp(buffer)
						? { mimeType: 'image/webp', extension: 'webp' }
						: pdf(buffer)
							? { mimeType: 'application/pdf', extension: 'pdf' }
							: null;
	if (!format)
		throw new OptionalException(
			415,
			'Only valid JPG, PNG, WebP or PDF containers are supported',
		);
	const fileName = posix
		.basename(file.originalname.replace(/\\/g, '/'))
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.trim();
	const extension = posix
		.extname(fileName)
		.slice(1)
		.toLowerCase()
		.replace(/^jpeg$/, 'jpg');
	if (
		!fileName ||
		fileName.length > 255 ||
		extension !== format.extension ||
		![format.mimeType, 'application/octet-stream'].includes(file.mimetype)
	)
		throw new OptionalException(
			422,
			'Filename or MIME does not match the file content',
		);
	return { buffer, fileName, ...format };
}
