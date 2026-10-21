import type { Request, Response } from 'express';
import { InvitationService } from './invitation.service';

export class InvitationController {
	constructor(private readonly service = new InvitationService()) {}
	async inviteUserToProject(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.inviteUserToProject(
				req.params.projectId as string,
				req.user!.id!,
				req.body.email,
				req.body.roleId,
			),
		});
	}
	async inviteUserToBoard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.inviteUserToBoard(
				req.params.boardId as string,
				req.user!.id!,
				req.body.email,
				req.body.roleId,
			),
		});
	}
	async createShareLinkForProject(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.createShareLinkForProject(
				req.params.projectId as string,
				req.user!.id!,
				req.body.roleId,
			),
		});
	}
	async createShareLinkForBoard(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.createShareLinkForBoard(
				req.params.boardId as string,
				req.user!.id!,
				req.body.roleId,
			),
		});
	}
	async acceptInvitation(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.acceptInvitation(
				req.params.token as string,
				req.user!.id!,
			),
		});
	}
	async rejectInvitation(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: await this.service.rejectInvitation(
				req.params.token as string,
				req.user!.id!,
			),
		});
	}
}
