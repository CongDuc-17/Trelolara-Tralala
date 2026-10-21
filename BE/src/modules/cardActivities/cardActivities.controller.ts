import type { Request, Response } from 'express';
import { CardActivitiesService } from './cardActivities.service';
import type { CardActivityQuery } from './cardActivities.types';

export class CardActivitiesController {
	constructor(private readonly service = new CardActivitiesService()) {}
	async list(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.list(
				req.params.cardId as string,
				req.user!.id!,
				req.query as unknown as CardActivityQuery,
			),
		});
	}
}
