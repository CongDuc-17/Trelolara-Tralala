import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';
import { HttpResponseDto } from '@/common';

import { ChecklistItemsService } from './checklistItems.service';

export class ChecklistItemsController {
	constructor(
		private checklistItemsService: ChecklistItemsService = new ChecklistItemsService(),
	) {}

	async createChecklistItem(req: Request): Promise<Response> {
		const { checklistId } = req.params as { checklistId: string };
		const { title } = req.body;
		const result = await this.checklistItemsService.createChecklistItem(
			checklistId,
			title,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async updateChecklistItem(req: Request): Promise<Response> {
		const { checklistItemId } = req.params as { checklistItemId: string };
		const { title, completed } = req.body;
		console.log('Update Checklist Item', checklistItemId, title, completed);
		const result = await this.checklistItemsService.updateChecklistItem(
			checklistItemId,
			title,
			completed,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async deleteChecklistItem(req: Request): Promise<Response> {
		const { checklistItemId } = req.params as { checklistItemId: string };
		const result =
			await this.checklistItemsService.deleteChecklistItem(checklistItemId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}
}
