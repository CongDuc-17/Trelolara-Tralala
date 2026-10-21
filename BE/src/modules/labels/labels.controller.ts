import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';
import { HttpResponseDto } from '@/common';

import { LabelsService } from './labels.service';
import { LabelResponseDto } from './dtos/responses';

export class LabelsController {
	constructor(private readonly labelsService: LabelsService = new LabelsService()) {}
	async createLabel(req: Request): Promise<Response> {
		const { boardId } = req.params as { boardId: string };
		const { name, color } = req.body;
		const result = await this.labelsService.createLabel(name, color, boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async updateLabel(req: Request): Promise<Response> {
		const { name, color } = req.body;
		const { labelId } = req.params as { labelId: string };
		const result = await this.labelsService.updateLabel(labelId, name, color);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async getLabelsByBoardId(req: Request): Promise<Response> {
		const { boardId } = req.params as { boardId: string };
		const result = await this.labelsService.getLabelsByBoardId(boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<LabelResponseDto[]>({ data: result });
	}

	async deleteLabel(req: Request): Promise<Response> {
		const { labelId } = req.params as { labelId: string };
		const result = await this.labelsService.deleteLabel(labelId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}
}
