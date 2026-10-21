import type { Request, Response } from 'express';
import { ListsService } from './list.service';

export class ListsController {
	constructor(private readonly listsService = new ListsService()) {}

	async getAllListsByBoardId(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.getAllListsByBoardId(
			req.params.boardId as string,
			req.query.status as 'ACTIVE' | 'ARCHIVED' | undefined,
		);
		return res.json({ success: true, data: result });
	}

	async createList(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.createList(
			req.body.name,
			req.params.boardId as string,
		);
		return res.json({ success: true, data: result });
	}

	async moveList(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.moveList(
			req.params.listId as string,
			req.body.beforeListId,
			req.body.afterListId,
		);
		return res.json({ success: true, data: result });
	}

	async updateList(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.updateListName(
			req.body.name,
			req.params.listId as string,
		);
		return res.json({ success: true, data: result });
	}

	async archiveList(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.archiveList(req.params.listId as string);
		return res.json({ success: true, data: result });
	}

	async restoreList(req: Request, res: Response): Promise<Response> {
		const result = await this.listsService.restoreList(req.params.listId as string);
		return res.json({ success: true, data: result });
	}

	async deleteList(req: Request, res: Response): Promise<Response> {
		await this.listsService.deleteList(req.params.listId as string);
		return res.json({ success: true, data: null });
	}
}
