export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export interface AttachmentFile {
	buffer: Buffer;
	originalname: string;
	mimetype: string;
}
export interface ValidatedAttachment {
	buffer: Buffer;
	fileName: string;
	mimeType: string;
	extension: string;
}
export interface StoredAttachment {
	publicId: string;
	resourceType: string;
	deliveryType: string;
}
export interface AttachmentRecord {
	id: string;
	cardId: string;
	userId: string;
	fileName: string;
	fileUrl: string;
	fileSize: number;
	mimeType: string | null;
	storagePublicId: string | null;
	storageResourceType: string | null;
	storageDeliveryType: string | null;
	createdAt: Date;
}
export interface AttachmentView {
	id: string;
	cardId: string;
	userId: string;
	fileName: string;
	fileSize: number;
	mimeType: string | null;
	createdAt: Date;
	downloadUrl: string | null;
}
export interface AttachmentStorage {
	upload(
		file: ValidatedAttachment,
		target: StoredAttachment,
	): Promise<StoredAttachment>;
	delete(target: StoredAttachment): Promise<void>;
	download(target: StoredAttachment, expiresAt: Date): string;
}

export function attachmentStorage(record: AttachmentRecord): StoredAttachment | null {
	return record.storagePublicId &&
		record.storageResourceType === 'raw' &&
		record.storageDeliveryType === 'authenticated'
		? {
				publicId: record.storagePublicId,
				resourceType: record.storageResourceType,
				deliveryType: record.storageDeliveryType,
			}
		: null;
}
export function attachmentView(record: AttachmentRecord): AttachmentView {
	return {
		id: record.id,
		cardId: record.cardId,
		userId: record.userId,
		fileName: record.fileName,
		fileSize: record.fileSize,
		mimeType: record.mimeType,
		createdAt: record.createdAt,
		downloadUrl: attachmentStorage(record)
			? `/cards/${record.cardId}/attachments/${record.id}/download`
			: null,
	};
}
