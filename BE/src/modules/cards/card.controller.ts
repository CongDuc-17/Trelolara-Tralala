import { boards } from '@prisma/client';
import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';
import { HttpResponseDto } from '@/common';
import { CardsService } from './card.service';

export class CardsController {
	constructor(private readonly cardsService: CardsService = new CardsService()) {}

	async getAllCardsByListId(req: Request): Promise<Response> {
		const { listId } = req.params as { listId: string };
		const { status } = req.query as { status?: string };
		const user = req.user as { id: string };

		const result = await this.cardsService.getAllCardsByListId(
			listId,
			user.id,
			status,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any[]>(result);
	}

	async getCardById(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };

		// Parse query include
		const includeParam = (req.query.include as string) || '';
		const include = includeParam
			? {
					members: includeParam.includes('members'),
					labels: includeParam.includes('labels'),
					checklists: includeParam.includes('checklists'),
					comments: includeParam.includes('comments'),
				}
			: undefined;

		const result = await this.cardsService.getCardById(cardId, include);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async createCard(req: Request): Promise<Response> {
		try {
			const { listId } = req.params as { listId: string };
			const { title } = req.body;
			const user = req.user as { id: string };

			const result = await this.cardsService.createCard(title, listId, user.id);
			if (result instanceof Exception) {
				return new HttpResponseDto().exception(result);
			}
			return new HttpResponseDto().success<any>(result);
		} catch (error) {
			console.error('[CardsController] createCard error:', error);
			return new HttpResponseDto().exception(
				new Exception(500, 'Internal Server Error'),
			);
		}
	}

	async moveCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const { targetListId, beforeCardId, afterCardId } = req.body;
		const user = req.user as { id: string };

		const card = await this.cardsService.getCardById(cardId);
		if (!card) {
			return new HttpResponseDto().exception(new Exception(404, 'Card not found'));
		}

		const result = await this.cardsService.moveCard(
			cardId,
			targetListId,
			user.id,
			beforeCardId,
			afterCardId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async archiveCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const user = req.user as { id: string };
		const result = await this.cardsService.archiveCard(cardId, user.id);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async restoreCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const result = await this.cardsService.restoreCard(cardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async deleteCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const user = req.user as { id: string };
		const result = await this.cardsService.deleteCard(cardId, user.id);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async addLabelToCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const { labelId } = req.body;
		const result = await this.cardsService.addLabelToCard(cardId, labelId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async removeLabelFromCard(req: Request): Promise<Response> {
		const { cardId, labelId } = req.params as { cardId: string; labelId: string };

		const result = await this.cardsService.removeLabelFromCard(cardId, labelId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async addMemberToCard(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const { userId } = req.body;
		const user = req.user as { id: string };
		const result = await this.cardsService.addMemberToCard(cardId, userId, user.id);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async removeMemberFromCard(req: Request): Promise<Response> {
		const { cardId, memberId } = req.params as { cardId: string; memberId: string };
		console.log(
			`[CardsController] removeMemberFromCard - cardId: ${cardId}, memberId: ${memberId}`,
		);
		const result = await this.cardsService.removeMemberFromCard(cardId, memberId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}

		return new HttpResponseDto().success<any>(result);
	}
}
