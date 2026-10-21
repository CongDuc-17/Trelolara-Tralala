import { ForbiddenException, NotFoundException } from '@/common/exceptions';
import { CardsService } from '../cards/card.service';
import { CardMembersRepository } from '../cardMembers/cardMembers.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentsRepository } from './comments.repository';
import type { CommentRecord } from './comments.types';

export class CommentsService {
	constructor(
		private readonly repository = new CommentsRepository(),
		private readonly cards = new CardsService(),
		private readonly notifications = new NotificationsService(),
		private readonly members = new CardMembersRepository(),
	) {}
	async createComment(input: {
		cardId: string;
		userId: string;
		content: string;
	}): Promise<CommentRecord> {
		return this.saveComment(input);
	}
	async updateComment(input: {
		commentId: string;
		content: string;
		userId: string;
	}): Promise<CommentRecord> {
		const initial = await this.repository.getCommentById(input);
		if (!initial) throw new NotFoundException('Comment not found');
		return this.saveComment({ ...input, cardId: initial.cardId });
	}
	async getCommentsByCardId(input: { cardId: string }): Promise<CommentRecord[]> {
		await this.cards.getCardById(input.cardId);
		return this.repository.getCommentsByCardId(input);
	}
	private async saveComment(input: {
		cardId: string;
		userId: string;
		content: string;
		commentId?: string;
	}): Promise<CommentRecord> {
		const saved = await this.cards.withLockedCard(
			input.cardId,
			async (card, list, client) => {
				if (input.commentId) {
					const existing = await this.repository.getCommentById(
						{ commentId: input.commentId },
						client,
					);
					if (!existing) throw new NotFoundException('Comment not found');
					if (existing.userId !== input.userId) throw new ForbiddenException();
				}
				if (!(await this.repository.canWrite(input.userId, list.boardId, client)))
					throw new ForbiddenException();
				const comment = input.commentId
					? await this.repository.updateComment(
							{ commentId: input.commentId, content: input.content },
							client,
						)
					: await this.repository.createComment(
							{
								cardId: input.cardId,
								userId: input.userId,
								content: input.content,
							},
							client,
						);
				const recipients = await this.members.listUserIds(card.id, client);
				const notifications = [];
				for (const recipientUserId of new Set(
					recipients.filter((id) => id !== input.userId),
				)) {
					notifications.push(
						await this.notifications.persistCardCommented(
							{
								recipientUserId,
								actorId: input.userId,
								actorName: comment.user.name,
								cardId: card.id,
								cardTitle: card.title,
								content: input.content,
								boardId: list.boardId,
							},
							client,
						),
					);
				}
				return { comment, notifications };
			},
		);
		await this.notifications.deliver(saved.notifications);
		return saved.comment;
	}
}
