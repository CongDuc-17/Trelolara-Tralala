import { prisma, type DatabaseClient } from '../database';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { CardPermissionEnum } from '@/common/enums/permissions';
import type { CommentRecord } from './comments.types';

const user = { select: { id: true, name: true, email: true, avatar: true } } as const;
export class CommentsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	canWrite(userId: string, boardId: string, client: DatabaseClient): Promise<boolean> {
		return new PermissionService(
			new PermissionsRepository(client),
		).hasBoardPermission(userId, boardId, [CardPermissionEnum.UPDATE_CARD]);
	}
	createComment(
		input: { cardId: string; userId: string; content: string },
		client: DatabaseClient = this.client,
	): Promise<CommentRecord> {
		return client.cardComments.create({ data: input, include: { user } });
	}
	updateComment(
		input: { commentId: string; content: string },
		client: DatabaseClient = this.client,
	): Promise<CommentRecord> {
		return client.cardComments.update({
			where: { id: input.commentId },
			data: { content: input.content },
			include: { user },
		});
	}
	getCommentsByCardId({ cardId }: { cardId: string }): Promise<CommentRecord[]> {
		return this.client.cardComments.findMany({
			where: { cardId },
			include: { user },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		});
	}
	getCommentById(
		{ commentId }: { commentId: string },
		client: DatabaseClient = this.client,
	): Promise<CommentRecord | null> {
		return client.cardComments.findUnique({
			where: { id: commentId },
			include: { user },
		});
	}
}
