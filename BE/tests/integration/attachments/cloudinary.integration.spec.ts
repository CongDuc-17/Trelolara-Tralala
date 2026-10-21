import { randomUUID, createHash } from 'node:crypto';
import cloudinary from '@/configs/upload.config';
import { CloudinaryAttachmentStorage } from '@/modules/attachments/attachment.storage';
import { validateAttachmentFile } from '@/modules/attachments/attachment-file';
import { attachmentFile } from '../../fixtures/attachment-files';

const integration =
	process.env.RUN_CLOUDINARY_INTEGRATION === '1' ? describe : describe.skip;
integration('Cloudinary private attachment lifecycle (explicit opt-in, no DB)', () => {
	it.each(['jpg', 'png', 'webp', 'pdf'])(
		'uploads, protects, downloads and deletes %s',
		async (extension) => {
			const storage = new CloudinaryAttachmentStorage();
			const file = validateAttachmentFile(attachmentFile(extension));
			const target = {
				publicId: `TrelloLike_Attachments/verification-${randomUUID()}.${extension}`,
				resourceType: 'raw',
				deliveryType: 'authenticated',
			};
			try {
				const stored = await storage.upload(file, target);
				expect(stored).toEqual(target);
				const unsignedUrl = cloudinary.url(target.publicId, {
					resource_type: 'raw',
					type: 'authenticated',
					secure: true,
				});
				const unsigned = await fetch(unsignedUrl, {
					signal: AbortSignal.timeout(20000),
				});
				expect([401, 403, 404]).toContain(unsigned.status);
				await unsigned.body?.cancel();
				const url = storage.download(target, new Date(Date.now() + 60000));
				const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
				expect(response.status).toBe(200);
				expect(response.headers.get('content-disposition')).toContain(
					'attachment',
				);
				const received = Buffer.from(await response.arrayBuffer());
				expect(createHash('sha256').update(received).digest('hex')).toBe(
					createHash('sha256').update(file.buffer).digest('hex'),
				);
				const expired = await fetch(
					storage.download(target, new Date(Date.now() - 5000)),
					{ signal: AbortSignal.timeout(20000) },
				);
				expect([401, 403, 404]).toContain(expired.status);
				await expired.body?.cancel();
			} finally {
				await storage.delete(target);
				await storage.delete(target);
			}
		},
		120000,
	);
});
