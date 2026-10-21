import cloudinary from '@/configs/upload.config';
import { CloudinaryAttachmentStorage } from '@/modules/attachments/attachment.storage';
import { validateAttachmentFile } from '@/modules/attachments/attachment-file';
import { attachmentFile } from '../../../fixtures/attachment-files';

function fixture() {
	const provider = {
		config: jest.fn(() => ({
			cloud_name: 'test',
			api_key: 'test-key',
			api_secret: 'test-secret',
		})),
		uploader: { upload: jest.fn(), destroy: jest.fn() },
		utils: {
			private_download_url: jest
				.fn()
				.mockReturnValue('https://provider.invalid/signed'),
		},
	};
	const storage = new CloudinaryAttachmentStorage(
		provider as unknown as typeof cloudinary,
	);
	return { provider, storage };
}
const target = {
	publicId: 'TrelloLike_Attachments/id.png',
	resourceType: 'raw',
	deliveryType: 'authenticated',
};
describe('Cloudinary attachment adapter', () => {
	it('returns a controlled unavailable error before calling an unconfigured provider', async () => {
		const { provider, storage } = fixture();
		provider.config.mockReturnValue({ cloud_name: '', api_key: '', api_secret: '' });
		await expect(
			storage.upload(validateAttachmentFile(attachmentFile()), target),
		).rejects.toMatchObject({ status: 503 });
		expect(provider.uploader.upload).not.toHaveBeenCalled();
	});
	it('uses authenticated raw upload without overwrite and trusts only confirmed provider metadata', async () => {
		const { provider, storage } = fixture();
		const file = validateAttachmentFile(attachmentFile());
		provider.uploader.upload.mockResolvedValue({
			public_id: target.publicId,
			resource_type: 'raw',
			type: 'authenticated',
			bytes: file.buffer.length,
		});
		await expect(storage.upload(file, target)).resolves.toEqual(target);
		expect(provider.uploader.upload).toHaveBeenCalledWith(
			expect.stringContaining('data:image/png;base64,'),
			expect.objectContaining({
				public_id: target.publicId,
				resource_type: 'raw',
				type: 'authenticated',
				overwrite: false,
				timeout: 60000,
			}),
		);
	});
	it.each([
		{ public_id: 'different', resource_type: 'raw', type: 'authenticated', bytes: 1 },
		{ public_id: target.publicId, resource_type: 'image', type: 'upload', bytes: 1 },
	])('rejects an unexpected provider response', async (response) => {
		const { provider, storage } = fixture();
		provider.uploader.upload.mockResolvedValue(response);
		await expect(
			storage.upload(validateAttachmentFile(attachmentFile()), target),
		).rejects.toMatchObject({ status: 502, message: 'Attachment upload failed' });
	});
	it.each(['ok', 'not found'])('confirms idempotent deletion: %s', async (result) => {
		const { provider, storage } = fixture();
		provider.uploader.destroy.mockResolvedValue({ result });
		await expect(storage.delete(target)).resolves.toBeUndefined();
		expect(provider.uploader.destroy).toHaveBeenCalledWith(
			target.publicId,
			expect.objectContaining({
				resource_type: 'raw',
				type: 'authenticated',
				invalidate: true,
			}),
		);
	});
	it('does not swallow provider errors or expose credentials through errors', async () => {
		const { provider, storage } = fixture();
		provider.uploader.upload.mockRejectedValue(new Error('test-secret'));
		provider.uploader.destroy.mockResolvedValue({ result: 'pending' });
		await expect(
			storage.upload(validateAttachmentFile(attachmentFile()), target),
		).rejects.toMatchObject({ status: 502, message: 'Attachment upload failed' });
		await expect(storage.delete(target)).rejects.toMatchObject({
			status: 502,
			message: 'Attachment cleanup failed',
		});
	});
	it('uses the expiring API download URL instead of a permanent signed CDN URL', () => {
		const { provider, storage } = fixture();
		storage.download(target, new Date('2026-10-21T00:01:00Z'));
		expect(provider.utils.private_download_url).toHaveBeenCalledWith(
			target.publicId,
			'',
			{
				resource_type: 'raw',
				type: 'authenticated',
				attachment: true,
				expires_at: 1792540860,
			},
		);
		expect(() =>
			storage.download({ ...target, deliveryType: 'upload' }, new Date()),
		).toThrow(expect.objectContaining({ status: 409 }));
	});
});
