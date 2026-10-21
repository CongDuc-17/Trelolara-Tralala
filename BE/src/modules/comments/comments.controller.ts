import type { Request, Response } from 'express';
import { CommentsService } from './comments.service';
import { GetCommentResponseDto } from './dtos/responses';
import type { CommentRecord } from './comments.types';

const mapComment = (comment: CommentRecord) =>
	new GetCommentResponseDto({ ...comment, commentId: comment.id });
export class CommentsController {
	constructor(private readonly service = new CommentsService()) {}
	async getCommentsByCardId(req: Request, res: Response): Promise<Response> {
		const comments = await this.service.getCommentsByCardId({
			cardId: req.params.cardId as string,
		});
		return res.json({ success: true, data: comments.map(mapComment) });
	}
	async createComment(req: Request, res: Response): Promise<Response> {
		const comment = await this.service.createComment({
			cardId: req.params.cardId as string,
			userId: req.user!.id!,
			content: req.body.content,
		});
		return res.json({ success: true, data: mapComment(comment) });
	}
	async updateComment(req: Request, res: Response): Promise<Response> {
		const comment = await this.service.updateComment({
			commentId: req.params.commentId as string,
			userId: req.user!.id!,
			content: req.body.content,
		});
		return res.json({ success: true, data: mapComment(comment) });
	}
}
