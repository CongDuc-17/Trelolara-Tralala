import cloudinary from '../../configs/upload.config';

export const uploadImageFromBuffer = async (
	fileBuffer: Buffer,
	mimetype: string,
	folderName: string,
) => {
	const b64 = fileBuffer.toString('base64');
	const dataURI = `data:${mimetype};base64,${b64}`;

	const result = await cloudinary.uploader.upload(dataURI, {
		folder: folderName,
		resource_type: 'auto',
	});
	return result;
};

export const deleteImageFromCloudinary = async (publicId: string): Promise<void> => {
	try {
		const result = await cloudinary.uploader.destroy(publicId);
		if (result.result !== 'ok' && result.result !== 'not found') {
			throw new Error('Image deletion failed');
		}
	} catch {
		throw new Error('Image deletion failed');
	}
};

export const extractPublicIdFromUrl = (
	url: string,
	expectedFolder?: string,
): string | null => {
	try {
		const parsed = new URL(url);
		if (
			!['https:', 'http:'].includes(parsed.protocol) ||
			parsed.hostname !== 'res.cloudinary.com' ||
			parsed.port ||
			parsed.username ||
			parsed.password
		)
			return null;

		const [cloudName, resourceType, deliveryType, version, ...segments] =
			parsed.pathname.slice(1).split('/').map(decodeURIComponent);
		if (
			!cloudName ||
			cloudName !== cloudinary.config().cloud_name ||
			resourceType !== 'image' ||
			deliveryType !== 'upload' ||
			!/^v\d+$/.test(version ?? '') ||
			!segments.length ||
			segments.some(
				(segment) =>
					!segment ||
					segment === '.' ||
					segment === '..' ||
					/[\\/]/.test(segment),
			)
		)
			return null;

		// Only delete original uploads owned by this application, never arbitrary profile URLs.
		const publicId = segments.join('/').replace(/\.[^/.]+$/, '');
		if (!publicId || (expectedFolder && !publicId.startsWith(`${expectedFolder}/`)))
			return null;
		return publicId;
	} catch {
		return null;
	}
};
