import type { Request, Response } from 'express';
import { ChecklistItemsService } from './checklistItems.service';
import { ChecklistItemResponseDto } from './dtos/responses/checklistItem.response';
import type { ChecklistItemRecord } from '../checklists/checklists.types';

function mapItem(item: ChecklistItemRecord): ChecklistItemResponseDto {
	return new ChecklistItemResponseDto({
		id: item.id,
		title: item.title,
		isCompleted: item.completed,
		checklistId: item.checklistId,
	});
}
export class ChecklistItemsController {
	constructor(private readonly service = new ChecklistItemsService()) {}
	async createChecklistItem(req: Request, res: Response): Promise<Response> {
		const item = await this.service.createChecklistItem(
			req.params.checklistId as string,
			req.body.title,
			req.user!.id!,
		);
		return res.json({ success: true, data: mapItem(item) });
	}
	async updateChecklistItem(req: Request, res: Response): Promise<Response> {
		const item = await this.service.updateChecklistItem(
			req.params.checklistItemId as string,
			req.user!.id!,
			req.body.title,
			req.body.completed,
		);
		return res.json({ success: true, data: mapItem(item) });
	}
	async deleteChecklistItem(req: Request, res: Response): Promise<Response> {
		await this.service.deleteChecklistItem(
			req.params.checklistItemId as string,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}
}
