import type { Request, Response } from 'express';
import { CardsService } from './card.service';
import type { CardIncludes, CardStatus } from './cards.types';

export class CardsController {
	constructor(private readonly service = new CardsService()) {}
	async getAllCardsByListId(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.getAllCardsByListId(
				req.params.listId as string,
				req.user!.id!,
				req.query.status as CardStatus | undefined,
			),
		});
	}
	async getCardById(req: Request, res: Response): Promise<Response> {
		const tokens = new Set(
			String(req.query.include ?? '')
				.split(',')
				.map((item) => item.trim()),
		);
		const include: CardIncludes | undefined = req.query.include
			? {
					members: tokens.has('members'),
					labels: tokens.has('labels'),
					checklists: tokens.has('checklists'),
					comments: tokens.has('comments'),
				}
			: undefined;
		return res.json({
			success: true,
			data: await this.service.getCardById(req.params.cardId as string, include),
		});
	}
	async createCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.createCard(
				req.body.title,
				req.params.listId as string,
				req.user!.id!,
			),
		});
	}
	async updateCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.updateCard(
				req.params.cardId as string,
				req.body,
				req.user!.id!,
			),
		});
	}
	async moveCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.moveCard(
				req.params.cardId as string,
				req.body.targetListId,
				req.user!.id!,
				req.body.beforeCardId,
				req.body.afterCardId,
			),
		});
	}
	async archiveCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.archiveCard(
				req.params.cardId as string,
				req.user!.id!,
			),
		});
	}
	async restoreCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.restoreCard(
				req.params.cardId as string,
				req.user!.id!,
			),
		});
	}
	async deleteCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.deleteCard(
				req.params.cardId as string,
				req.user!.id!,
			),
		});
	}
	async addLabelToCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.addLabelToCard(
				req.params.cardId as string,
				req.body.labelId,
				req.user!.id!,
			),
		});
	}
	async removeLabelFromCard(req: Request, res: Response): Promise<Response> {
		await this.service.removeLabelFromCard(
			req.params.cardId as string,
			req.params.labelId as string,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}
	async addMemberToCard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.addMemberToCard(
				req.params.cardId as string,
				req.body.userId,
				req.user!.id!,
			),
		});
	}
	async removeMemberFromCard(req: Request, res: Response): Promise<Response> {
		await this.service.removeMemberFromCard(
			req.params.cardId as string,
			req.params.memberId as string,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}
}
