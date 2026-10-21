import type { Request, Response } from 'express';
import { AttachmentsService } from './attachments.service';

export class AttachmentsController {
	constructor(private readonly service = new AttachmentsService()) {}
	async upload(req: Request, res: Response): Promise<Response> {
		const data = await this.service.upload(
			req.params.cardId as string,
			req.user!.id!,
			req.file,
		);
		return res.status(201).json({ success: true, data });
	}
	async list(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.list(req.params.cardId as string, req.user!.id!),
		});
	}
	async download(req: Request, res: Response): Promise<Response> {
		res.setHeader('Cache-Control', 'private, no-store');
		res.setHeader('Pragma', 'no-cache');
		return res.json({
			success: true,
			data: await this.service.download(
				req.params.cardId as string,
				req.params.attachmentId as string,
				req.user!.id!,
			),
		});
	}
	async delete(req: Request, res: Response): Promise<Response> {
		await this.service.delete(
			req.params.cardId as string,
			req.params.attachmentId as string,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}
}
