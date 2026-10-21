import { validateAttachmentFile } from '@/modules/attachments/attachment-file';
import { MAX_ATTACHMENT_BYTES } from '@/modules/attachments/attachments.types';
import { attachmentFile } from '../../../fixtures/attachment-files';

describe('Attachment byte and container validation', () => {
	it.each(['jpg', 'png', 'webp', 'pdf'])(
		'detects %s from bytes and uses actual byte length',
		(extension) => {
			const file = attachmentFile(extension);
			expect(validateAttachmentFile(file)).toEqual({
				buffer: file.buffer,
				fileName: file.originalname,
				mimeType: file.mimetype,
				extension,
			});
			expect(() =>
				validateAttachmentFile({ ...file, buffer: file.buffer.subarray(0, 14) }),
			).toThrow();
		},
	);
	it('normalizes path components, JPEG aliases and generic MIME', () => {
		const file = attachmentFile('jpg');
		expect(
			validateAttachmentFile({
				...file,
				originalname: 'C:\\fakepath\\sample.JPEG',
				mimetype: 'application/octet-stream',
			}),
		).toMatchObject({
			fileName: 'sample.JPEG',
			mimeType: 'image/jpeg',
			extension: 'jpg',
		});
	});
	it.each([
		undefined,
		{ ...attachmentFile(), buffer: Buffer.alloc(0) },
		{ ...attachmentFile(), buffer: Buffer.from('<svg onload="alert(1)"/>') },
		{ ...attachmentFile(), buffer: Buffer.from('89504e470d0a1a0a', 'hex') },
		{ ...attachmentFile(), originalname: 'payload.pdf' },
		{ ...attachmentFile(), originalname: 'payload.svg', mimetype: 'image/svg+xml' },
		{ ...attachmentFile(), mimetype: 'application/pdf' },
	])('rejects empty/spoofed/disallowed files', (file) => {
		expect(() => validateAttachmentFile(file)).toThrow();
	});
	it('does not trust a client-provided size', () => {
		const file = {
			...attachmentFile(),
			buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
			size: 1,
		};
		expect(() => validateAttachmentFile(file)).toThrow(
			expect.objectContaining({ status: 413 }),
		);
	});
	it.each(['png', 'jpg', 'webp', 'pdf'])(
		'rejects truncated or appended %s containers',
		(extension) => {
			const file = attachmentFile(extension);
			expect(() =>
				validateAttachmentFile({
					...file,
					buffer: file.buffer.subarray(0, file.buffer.length - 8),
				}),
			).toThrow();
			expect(() =>
				validateAttachmentFile({
					...file,
					buffer: Buffer.concat([file.buffer, Buffer.from('<script>')]),
				}),
			).toThrow();
		},
	);
});
