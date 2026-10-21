import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';
import { HttpResponseDto } from '@/common';

import { ChecklistsService } from './checklists.service';

export class ChecklistsController {
	constructor(
		private readonly checklistsService: ChecklistsService = new ChecklistsService(),
	) {}

	async createChecklist(req: Request): Promise<Response> {
		const { cardId } = req.params as { cardId: string };
		const { title } = req.body;
		const result = await this.checklistsService.createChecklist(cardId, title);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async getChecklistById(req: Request): Promise<Response> {
		const { checklistId } = req.params as { checklistId: string };
		const result = await this.checklistsService.getChecklistById(checklistId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async updateChecklistTitle(req: Request): Promise<Response> {
		const { checklistId } = req.params as { checklistId: string };
		const { title } = req.body;
		const result = await this.checklistsService.updateChecklistTitle(
			checklistId,
			title,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async deleteChecklist(req: Request): Promise<Response> {
		const { checklistId } = req.params as { checklistId: string };
		const result = await this.checklistsService.deleteChecklist(checklistId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}
}
