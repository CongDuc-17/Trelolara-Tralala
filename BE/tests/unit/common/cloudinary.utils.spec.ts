import cloudinary from '@/configs/upload.config';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
} from '@/common/utils/cloudinary.utils';

jest.mock('@/configs/upload.config', () => ({
	__esModule: true,
	default: {
		config: () => ({ cloud_name: 'test-cloud' }),
		uploader: { destroy: jest.fn() },
	},
}));

describe('managed image cleanup', () => {
	const avatar =
		'https://res.cloudinary.com/test-cloud/image/upload/v123/TrelloLike_Avatars/nested/avatar.name.png';

	it('keeps nested public IDs and dots while removing the delivery extension', () => {
		expect(extractPublicIdFromUrl(avatar, 'TrelloLike_Avatars')).toBe(
			'TrelloLike_Avatars/nested/avatar.name',
		);
	});

	it.each([
		'https://example.com/TrelloLike_Avatars/avatar.png',
		avatar.replace('test-cloud', 'another-cloud'),
		avatar.replace('image/upload', 'image/private'),
		avatar.replace('/v123/', '/w_200/v123/'),
		avatar.replace('res.cloudinary.com', 'res.cloudinary.com.evil.test'),
		avatar.replace('/nested/', '/%2F/'),
		'not a URL',
	])(
		'ignores URLs that do not identify an original upload owned by the app: %s',
		(url) => {
			expect(extractPublicIdFromUrl(url, 'TrelloLike_Avatars')).toBeNull();
		},
	);

	it('does not let avatar cleanup delete board backgrounds', () => {
		expect(
			extractPublicIdFromUrl(
				avatar.replace('TrelloLike_Avatars', 'TrelloLike_BoardBackgrounds'),
				'TrelloLike_Avatars',
			),
		).toBeNull();
	});

	it.each(['ok', 'not found'])(
		'accepts an idempotent destroy result: %s',
		async (result) => {
			jest.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result });
			await expect(
				deleteImageFromCloudinary('folder/asset'),
			).resolves.toBeUndefined();
		},
	);

	it('surfaces a sanitized failure so the caller can handle compensation', async () => {
		jest.mocked(cloudinary.uploader.destroy).mockRejectedValueOnce(
			new Error('secret provider credential'),
		);
		await expect(deleteImageFromCloudinary('folder/asset')).rejects.toThrow(
			'Image deletion failed',
		);
	});

	it('does not silently accept unsuccessful destroy responses', async () => {
		jest.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({
			result: 'error',
		});
		await expect(deleteImageFromCloudinary('folder/asset')).rejects.toThrow(
			'Image deletion failed',
		);
	});
});
