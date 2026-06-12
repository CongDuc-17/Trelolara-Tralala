import { CommentsService } from './comments.service';
import { GetCommentResponseDto } from './dtos/responses';
import { Request, Response } from 'express';
import { HttpResponseDto } from '@/common';
import { Exception } from '@tsed/exceptions';
export class CommentsController {
	constructor(private commentsService: CommentsService = new CommentsService()) {}

	async getCommentsByCardId(req: Request): Promise<Response> {
		const cardId = req.params.cardId as string;
		const result = await this.commentsService.getCommentsByCardId({ cardId });
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetCommentResponseDto[]>(result);
	}

	async createComment(req: Request): Promise<Response> {
		const cardId = req.params.cardId as string;
		const userId = (req.user as { id: string }).id;
		const content = req.body.content as string;
		const result = await this.commentsService.createComment({
			cardId,
			userId,
			content,
		});
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetCommentResponseDto>(result);
	}

	async updateComment(req: Request): Promise<Response> {
		const commentId = req.params.commentId as string;
		const content = req.body.content as string;
		const userId = (req.user as { id: string }).id;
		const result = await this.commentsService.updateComment({
			commentId,
			content,
			userId,
		});
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetCommentResponseDto>(result);
	}
}
