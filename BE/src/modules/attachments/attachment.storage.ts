import cloudinary from '@/configs/upload.config';
import { OptionalException } from '@/common/exceptions';
import type {
	AttachmentStorage,
	StoredAttachment,
	ValidatedAttachment,
} from './attachments.types';

export class CloudinaryAttachmentStorage implements AttachmentStorage {
	constructor(private readonly provider = cloudinary) {}
	private requireConfiguration(): void {
		const config = this.provider.config();
		if (!config.cloud_name || !config.api_key || !config.api_secret)
			throw new OptionalException(503, 'Attachment storage is unavailable');
	}
	async upload(
		file: ValidatedAttachment,
		target: StoredAttachment,
	): Promise<StoredAttachment> {
		this.requireConfiguration();
		try {
			const result = await this.provider.uploader.upload(
				`data:${file.mimeType};base64,${file.buffer.toString('base64')}`,
				{
					public_id: target.publicId,
					resource_type: 'raw',
					type: 'authenticated',
					overwrite: false,
					timeout: 60000,
				},
			);
			if (
				result.public_id !== target.publicId ||
				result.resource_type !== 'raw' ||
				result.type !== 'authenticated' ||
				result.bytes !== file.buffer.length
			)
				throw new Error('Unexpected attachment storage response');
			return {
				publicId: result.public_id,
				resourceType: result.resource_type,
				deliveryType: result.type,
			};
		} catch {
			throw new OptionalException(502, 'Attachment upload failed');
		}
	}
	async delete(target: StoredAttachment): Promise<void> {
		this.requireConfiguration();
		try {
			const options = {
				resource_type: target.resourceType,
				type: target.deliveryType,
				invalidate: true,
				timeout: 60000,
			};
			const result = await this.provider.uploader.destroy(target.publicId, options);
			if (result.result !== 'ok' && result.result !== 'not found')
				throw new Error('Storage deletion not confirmed');
		} catch {
			throw new OptionalException(502, 'Attachment cleanup failed');
		}
	}
	download(target: StoredAttachment, expiresAt: Date): string {
		this.requireConfiguration();
		if (target.resourceType !== 'raw' || target.deliveryType !== 'authenticated')
			throw new OptionalException(
				409,
				'Legacy attachment requires storage reconciliation',
			);
		// Raw public IDs include the extension; the download API must not append it twice.
		return this.provider.utils.private_download_url(target.publicId, '', {
			resource_type: 'raw',
			type: 'authenticated',
			attachment: true,
			expires_at: Math.floor(expiresAt.getTime() / 1000),
		});
	}
}
