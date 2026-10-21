import type { DatabaseClient } from '../database';

export type AttachmentDeletionScope =
	| { cardId: string; attachmentId?: string }
	| { listId: string }
	| { boardId: string };

/** Caller holds parent locks; jobs and metadata deletion must share its transaction. */
export async function deleteAttachments(
	client: DatabaseClient,
	scope: AttachmentDeletionScope,
): Promise<void> {
	const where =
		'cardId' in scope
			? {
					cardId: scope.cardId,
					...(scope.attachmentId ? { id: scope.attachmentId } : {}),
				}
			: 'listId' in scope
				? { card: { listId: scope.listId } }
				: { card: { list: { boardId: scope.boardId } } };
	const attachments = await client.cardAttachments.findMany({ where });
	if (attachments.length) {
		await client.attachmentCleanupJobs.createMany({
			data: attachments.map((attachment) => ({
				id: attachment.id,
				publicId: attachment.storagePublicId,
				resourceType: attachment.storageResourceType,
				deliveryType: attachment.storageDeliveryType,
				// Unknown legacy keys are retained for manual reconciliation, never guessed from URLs.
				legacyFileUrl: attachment.fileUrl,
				availableAt:
					attachment.storagePublicId &&
					attachment.storageResourceType &&
					attachment.storageDeliveryType
						? new Date()
						: null,
			})),
			skipDuplicates: true,
		});
	}
	await client.cardAttachments.deleteMany({ where });
}
