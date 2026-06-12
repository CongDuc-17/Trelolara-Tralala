import { CommentsRepository } from './comments.repository';
import {
	ForbiddenException,
	HttpResponseBodySuccessDto,
	InternalServerException,
	NotFoundException,
	ObjectComparerDto,
	OptionalException,
	PaginationDto,
	PaginationUtils,
} from '@/common';
import { GetCommentResponseDto } from './dtos/responses';
import { CardsRepository } from '../cards/card.repository';
import { UsersRepository } from '../users/users.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { ListsRepository } from '../lists/list.repository';
export class CommentsService {
	constructor(
		private readonly commentsRepository: CommentsRepository = new CommentsRepository(),
		private readonly cardsRepository: CardsRepository = new CardsRepository(),
		private readonly userRepository: UsersRepository = new UsersRepository(),
		private readonly notificationService: NotificationsService = new NotificationsService(),
		private readonly listsRepository: ListsRepository = new ListsRepository(),
	) {}

	async createComment({
		cardId,
		userId,
		content,
	}: {
		cardId: string;
		userId: string;
		content: string;
	}): Promise<HttpResponseBodySuccessDto<GetCommentResponseDto>> {
		const card = await this.cardsRepository.getCardWithIncludes(cardId, {
			members: true,
		});

		if (!card) {
			throw new NotFoundException('Card not found');
		}
		const user = await this.userRepository.findUser({ userId });
		if (!user) {
			throw new NotFoundException('User not found');
		}

		const comment = await this.commentsRepository.createComment({
			cardId,
			userId,
			content,
		});

		const list = await this.listsRepository.getListById(String(card.listId));

		// Notify all members of the card except the actor
		if (card.cardMembers && card.cardMembers.length > 0 && list) {
			const notifyPromises = card.cardMembers
				.filter((member: any) => member.userId !== userId)
				.map((member: any) =>
					this.notificationService.notifyCardCommented({
						recipientUserId: member.userId,
						actorId: userId,
						actorName: user.name,
						cardId,
						cardTitle: String(card.title),
						content,
						boardId: String(list.boardId),
					}),
				);
			await Promise.all(notifyPromises);
		}

		return {
			success: true,
			data: new GetCommentResponseDto({
				commentId: comment.id,
				cardId: comment.cardId,
				user: comment.user,
				content: comment.content,
				createdAt: comment.createdAt,
				updatedAt: comment.updatedAt,
			}),
		};
	}

	async updateComment({
		commentId,
		content,
		userId,
	}: {
		commentId: string;
		content: string;
		userId: string;
	}): Promise<HttpResponseBodySuccessDto<GetCommentResponseDto>> {
		const existingComment = await this.commentsRepository.getCommentById({
			commentId,
		});
		if (!existingComment) {
			throw new NotFoundException('Comment not found');
		}
		const card = await this.cardsRepository.getCardWithIncludes(
			existingComment.cardId,
			{
				members: true,
			},
		);
		if (!card) {
			throw new NotFoundException('Card not found');
		}

		if (existingComment.userId !== userId) {
			throw new ForbiddenException();
		}
		const comment = await this.commentsRepository.updateComment({
			commentId,
			content,
		});

		const list = await this.listsRepository.getListById(String(card.listId));
		const user = await this.userRepository.findUser({ userId });
		if (!user) {
			throw new NotFoundException('User not found');
		}

		if (card.cardMembers && card.cardMembers.length > 0 && list) {
			const notifyPromises = card.cardMembers
				.filter((member: any) => member.userId !== userId)
				.map((member: any) =>
					this.notificationService.notifyCardCommented({
						recipientUserId: member.userId,
						actorId: userId,
						actorName: user.name,
						cardId: String(card.id),
						cardTitle: String(card.title),
						content,
						boardId: String(list.boardId),
					}),
				);
			await Promise.all(notifyPromises);
		}

		return {
			success: true,
			data: new GetCommentResponseDto({
				commentId: comment.id,
				cardId: comment.cardId,
				user: comment.user,
				content: comment.content,
				createdAt: comment.createdAt,
				updatedAt: comment.updatedAt,
			}),
		};
	}

	async getCommentsByCardId({
		cardId,
	}: {
		cardId: string;
	}): Promise<HttpResponseBodySuccessDto<GetCommentResponseDto[]>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) {
			throw new NotFoundException('Card not found');
		}
		const comments = await this.commentsRepository.getCommentsByCardId({ cardId });
		return {
			success: true,
			data: comments.map(
				(comment) =>
					new GetCommentResponseDto({
						commentId: comment.id,
						cardId: comment.cardId,
						user: {
							id: comment.user.id,
							name: comment.user.name,
							email: comment.user.email,
							avatar: comment.user.avatar,
						},
						content: comment.content,
						createdAt: comment.createdAt,
						updatedAt: comment.updatedAt,
					}),
			),
		};
	}
}
