import type { Request, Response } from 'express';
import { ChecklistsService } from './checklists.service';
import { ChecklistResponseDto } from './dtos/responses';

export class ChecklistsController {
	constructor(private readonly service = new ChecklistsService()) {}
	async createChecklist(req: Request, res: Response): Promise<Response> {
		const data = await this.service.createChecklist(
			req.params.cardId as string,
			req.body.title,
			req.user!.id!,
		);
		return res.json({ success: true, data: new ChecklistResponseDto(data) });
	}
	async getChecklistById(req: Request, res: Response): Promise<Response> {
		const data = await this.service.getChecklistById(
			req.params.checklistId as string,
		);
		return res.json({ success: true, data: new ChecklistResponseDto(data) });
	}
	async updateChecklistTitle(req: Request, res: Response): Promise<Response> {
		const data = await this.service.updateChecklistTitle(
			req.params.checklistId as string,
			req.body.title,
			req.user!.id!,
		);
		return res.json({ success: true, data: new ChecklistResponseDto(data) });
	}
	async deleteChecklist(req: Request, res: Response): Promise<Response> {
		await this.service.deleteChecklist(
			req.params.checklistId as string,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}
}
