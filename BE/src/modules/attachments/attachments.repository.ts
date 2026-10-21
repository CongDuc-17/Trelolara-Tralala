import { CardPermissionEnum } from '@/common/enums/permissions';
import { prisma, type DatabaseClient } from '../database';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import type { AttachmentRecord } from './attachments.types';

export class AttachmentsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	canAccess(
		userId: string,
		boardId: string,
		permission: CardPermissionEnum,
		client: DatabaseClient,
	): Promise<boolean> {
		return new PermissionService(
			new PermissionsRepository(client),
		).hasBoardPermission(userId, boardId, [permission]);
	}
	list(
		cardId: string,
		client: DatabaseClient = this.client,
	): Promise<AttachmentRecord[]> {
		return client.cardAttachments.findMany({
			where: { cardId },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		});
	}
	find(
		cardId: string,
		attachmentId: string,
		client: DatabaseClient,
	): Promise<AttachmentRecord | null> {
		return client.cardAttachments.findFirst({ where: { id: attachmentId, cardId } });
	}
	create(
		record: Omit<AttachmentRecord, 'createdAt'>,
		client: DatabaseClient,
	): Promise<AttachmentRecord> {
		return client.cardAttachments.create({ data: record });
	}
}
