import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';

import { InvitationService } from './invitation.service';
import { HttpResponseDto } from '@/common/dtos/httpResponse.dto';

export class InvitationController {
	constructor(private readonly invitationService = new InvitationService()) {}
	async inviteUserToProject(req: Request): Promise<Response> {
		const { projectId } = req.params as { projectId: string };
		const { email, roleId } = req.body;
		const inviterId = (req.user as { id: string }).id;
		const result = await this.invitationService.inviteUserToProject(
			projectId,
			inviterId,
			email,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async inviteUserToBoard(req: Request): Promise<Response> {
		const { boardId } = req.params as { boardId: string };
		const { email, roleId } = req.body;
		const inviterId = (req.user as { id: string }).id;
		const result = await this.invitationService.inviteUserToBoard(
			boardId,
			inviterId,
			email,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async createShareLinkForProject(req: Request): Promise<Response> {
		const { projectId } = req.params as { projectId: string };
		console.log('projectId', projectId);
		const inviterId = (req.user as { id: string }).id;
		const roleId = req.body.roleId;
		const result = await this.invitationService.createShareLinkForProject(
			projectId,
			inviterId,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async createShareLinkForBoard(req: Request): Promise<Response> {
		const { boardId } = req.params as { boardId: string };
		const inviterId = (req.user as { id: string }).id;
		const roleId = req.body.roleId;
		const result = await this.invitationService.createShareLinkForBoard(
			boardId,
			inviterId,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async acceptInvitation(req: Request, res: Response, next: Function) {
		const { token } = req.params as { token: string };
		const userId = (req.user as { id: string }).id;
		const result = await this.invitationService.acceptInvitation(token, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	async rejectInvitation(req: Request, res: Response, next: Function) {
		const { token } = req.params as { token: string };
		const userId = (req.user as { id: string }).id;
		const result = await this.invitationService.rejectInvitation(token, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<any>(result);
	}

	// async getInvitationInfo(req: Request, res: Response, next: Function) {
	// 	try {
	// 		const { token } = req.params;
	// 		const result = await this.invitationService.getInvitationInfo(token);
	// 		res.status(result.code).json({
	// 			success: result.success,
	// 			message: result.message,
	// 			data: result.data,
	// 		});
	// 	} catch (error) {
	// 		next(error);
	// 	}
	// }
}
