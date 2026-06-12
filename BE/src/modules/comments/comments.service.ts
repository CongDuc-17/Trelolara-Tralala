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
export class CommentsService {
	constructor(
		private readonly commentsRepository: CommentsRepository = new CommentsRepository(),
		private readonly cardsRepository: CardsRepository = new CardsRepository(),
		private readonly userRepository: UsersRepository = new UsersRepository(),
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
		const card = await this.cardsRepository.getCardById(cardId);
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
		if (existingComment.userId !== userId) {
			throw new ForbiddenException();
		}
		const comment = await this.commentsRepository.updateComment({
			commentId,
			content,
		});

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
