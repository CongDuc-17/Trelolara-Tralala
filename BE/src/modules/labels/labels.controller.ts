import type { Request, Response } from 'express';
import { LabelsService } from './labels.service';
import { LabelResponseDto } from './dtos/responses';

export class LabelsController {
	constructor(private readonly service = new LabelsService()) {}
	async createLabel(req: Request, res: Response): Promise<Response> {
		const label = await this.service.createLabel(
			req.body.name,
			req.body.color,
			req.params.boardId as string,
		);
		return res.json({ success: true, data: new LabelResponseDto(label) });
	}
	async updateLabel(req: Request, res: Response): Promise<Response> {
		const label = await this.service.updateLabel(
			req.params.labelId as string,
			req.body,
		);
		return res.json({ success: true, data: new LabelResponseDto(label) });
	}
	async getLabelsByBoardId(req: Request, res: Response): Promise<Response> {
		const labels = await this.service.getLabelsByBoardId(
			req.params.boardId as string,
		);
		return res.json({ data: labels.map((label) => new LabelResponseDto(label)) });
	}
	async deleteLabel(req: Request, res: Response): Promise<Response> {
		await this.service.deleteLabel(req.params.labelId as string);
		return res.json({ success: true, data: null });
	}
}
