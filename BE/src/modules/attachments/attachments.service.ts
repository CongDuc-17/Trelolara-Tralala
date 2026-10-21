import { randomUUID } from 'node:crypto';
import {
	ForbiddenException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import { CardPermissionEnum } from '@/common/enums/permissions';
import { CardsService } from '../cards/card.service';
import { recordCardActivity } from '../cardActivities/card-activity';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentCleanupRepository } from './attachment-cleanup.repository';
import { CloudinaryAttachmentStorage } from './attachment.storage';
import { validateAttachmentFile } from './attachment-file';
import { deleteAttachments } from './attachment-deletion';
import {
	attachmentStorage,
	attachmentView,
	type AttachmentFile,
	type AttachmentStorage,
	type AttachmentView,
	type StoredAttachment,
} from './attachments.types';

export class AttachmentsService {
	constructor(
		private readonly repository = new AttachmentsRepository(),
		private readonly cards = new CardsService(),
		private readonly storage: AttachmentStorage = new CloudinaryAttachmentStorage(),
		private readonly cleanup = new AttachmentCleanupRepository(),
	) {}
	async upload(
		cardId: string,
		actorId: string,
		file?: AttachmentFile,
	): Promise<AttachmentView> {
		const validated = validateAttachmentFile(file);
		// Release parent locks before calling storage; repeat permission/lifecycle checks after upload.
		await this.cards.withLockedCard(cardId, async (_card, list, client) => {
			if (
				!(await this.repository.canAccess(
					actorId,
					list.boardId,
					CardPermissionEnum.UPDATE_CARD,
					client,
				))
			)
				throw new ForbiddenException();
		});
		const id = randomUUID();
		const target: StoredAttachment = {
			publicId: `TrelloLike_Attachments/${id}.${validated.extension}`,
			resourceType: 'raw',
			deliveryType: 'authenticated',
		};
		await this.cleanup.reserveUpload(id, target);
		let uploaded = false;
		try {
			const stored = await this.storage.upload(validated, target);
			uploaded = true;
			if (
				stored.publicId !== target.publicId ||
				stored.resourceType !== target.resourceType ||
				stored.deliveryType !== target.deliveryType
			)
				throw new OptionalException(
					502,
					'Unexpected attachment storage response',
				);
			const attachment = await this.cards.withLockedCard(
				cardId,
				async (_card, list, client) => {
					if (
						!(await this.repository.canAccess(
							actorId,
							list.boardId,
							CardPermissionEnum.UPDATE_CARD,
							client,
						))
					)
						throw new ForbiddenException();
					await this.cleanup.completeUpload(id, client);
					const record = await this.repository.create(
						{
							id,
							cardId,
							userId: actorId,
							fileName: validated.fileName,
							fileSize: validated.buffer.length,
							fileUrl: `/cards/${cardId}/attachments/${id}/download`,
							mimeType: validated.mimeType,
							storagePublicId: stored.publicId,
							storageResourceType: stored.resourceType,
							storageDeliveryType: stored.deliveryType,
						},
						client,
					);
					await recordCardActivity(client, {
						cardId,
						userId: actorId,
						action: 'attachment_added',
						metadata: {
							attachmentId: record.id,
							fileName: record.fileName,
							fileSize: record.fileSize,
							mimeType: record.mimeType,
						},
					});
					return record;
				},
			);
			return attachmentView(attachment);
		} catch (error) {
			// An uncertain upload can finish remotely after a timeout; keep its 24-hour cleanup delay.
			if (uploaded) {
				try {
					await this.cleanup.expedite(id);
				} catch {
					console.error('[Attachments] Upload cleanup remains scheduled', id);
				}
			}
			throw error;
		}
	}
	list(cardId: string, actorId: string): Promise<AttachmentView[]> {
		return this.cards.withLockedCard(
			cardId,
			async (_card, list, client) => {
				if (
					!(await this.repository.canAccess(
						actorId,
						list.boardId,
						CardPermissionEnum.GET_CARD,
						client,
					))
				)
					throw new ForbiddenException();
				return (await this.repository.list(cardId, client)).map(attachmentView);
			},
			false,
		);
	}
	download(
		cardId: string,
		attachmentId: string,
		actorId: string,
	): Promise<{ url: string; expiresAt: Date }> {
		return this.cards.withLockedCard(
			cardId,
			async (_card, list, client) => {
				if (
					!(await this.repository.canAccess(
						actorId,
						list.boardId,
						CardPermissionEnum.GET_CARD,
						client,
					))
				)
					throw new ForbiddenException();
				const attachment = await this.repository.find(
					cardId,
					attachmentId,
					client,
				);
				if (!attachment) throw new NotFoundException('Attachment not found');
				const target = attachmentStorage(attachment);
				if (!target)
					throw new OptionalException(
						409,
						'Legacy attachment requires storage reconciliation',
					);
				const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 60000);
				return { url: this.storage.download(target, expiresAt), expiresAt };
			},
			false,
		);
	}
	async delete(cardId: string, attachmentId: string, actorId: string): Promise<void> {
		await this.cards.withLockedCard(
			cardId,
			async (_card, list, client) => {
				if (
					!(await this.repository.canAccess(
						actorId,
						list.boardId,
						CardPermissionEnum.DELETE_CARD,
						client,
					))
				)
					throw new ForbiddenException();
				const attachment = await this.repository.find(
					cardId,
					attachmentId,
					client,
				);
				if (!attachment) throw new NotFoundException('Attachment not found');
				await deleteAttachments(client, { cardId, attachmentId });
				await recordCardActivity(client, {
					cardId,
					userId: actorId,
					action: 'attachment_deleted',
					metadata: {
						attachmentId: attachment.id,
						fileName: attachment.fileName,
						fileSize: attachment.fileSize,
						mimeType: attachment.mimeType,
					},
				});
			},
			false,
		);
	}
}
