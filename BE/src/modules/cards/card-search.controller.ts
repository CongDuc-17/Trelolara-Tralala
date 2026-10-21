import type { Request, Response } from 'express';
import { CardSearchService } from './card-search.service';
import type { CardSearchInput } from './card-search.schema';

export class CardSearchController {
	constructor(private readonly service = new CardSearchService()) {}
	async board(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.search(
				req.user!.id!,
				req.query as unknown as CardSearchInput,
				req.params.boardId as string,
			),
		});
	}
	async mine(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.search(req.user!.id!, {
				...req.query,
				status: 'ACTIVE',
			} as CardSearchInput),
		});
	}
}
