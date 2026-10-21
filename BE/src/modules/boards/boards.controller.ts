import type { Request, Response } from 'express';
import { OptionalException } from '@/common/exceptions';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { BoardsService } from './boards.service';
import {
	GetBoardMembersResponseDto,
	GetBoardResponseDto,
	UpdateBoardResponseDto,
} from './dtos/responses';
import type { BoardStatus } from './boards.types';

export class BoardsController {
	constructor(private readonly service = new BoardsService()) {}

	async getMyBoards(req: Request, res: Response): Promise<Response> {
		const result = await this.service.getBoardsOfUser(
			req.user!.id!,
			{ status: req.query.status as BoardStatus | undefined },
			new PaginationDto(req.query),
		);
		return res.json({
			success: true,
			data: result.items.map((board) => ({ ...board })),
			pagination: this.pagination(result),
		});
	}

	async createBoard(req: Request, res: Response): Promise<Response> {
		const result = await this.service.createBoard(
			req.params.projectId as string,
			req.body,
			req.user!.id!,
		);
		return res.json({ success: true, data: new GetBoardResponseDto(result) });
	}

	async getBoards(req: Request, res: Response): Promise<Response> {
		const result = await this.service.getBoardsOfUserInProject(
			req.params.projectId as string,
			req.user!.id!,
			{ status: req.query.status as BoardStatus | undefined },
			new PaginationDto(req.query),
		);
		return res.json({
			success: true,
			data: result.items,
			pagination: this.pagination(result),
		});
	}

	async getBoardById(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: new GetBoardResponseDto(
				await this.service.getBoardById(
					req.params.boardId as string,
					req.user!.id!,
				),
			),
		});
	}

	async updateBoardInformation(req: Request, res: Response): Promise<Response> {
		return res.json({
			success: true,
			data: new UpdateBoardResponseDto(
				await this.service.updateBoard(req.params.boardId as string, req.body),
			),
		});
	}

	async uploadBackground(req: Request, res: Response): Promise<Response> {
		if (!req.file) throw new OptionalException(400, 'File is required');
		return res.json({
			success: true,
			data: new UpdateBoardResponseDto(
				await this.service.uploadBackground(
					req.params.boardId as string,
					req.file,
				),
			),
		});
	}

	async archiveBoard(req: Request, res: Response): Promise<Response> {
		await this.service.archiveBoard(req.params.boardId as string);
		return res.json({ success: true, data: null });
	}

	async restoreBoard(req: Request, res: Response): Promise<Response> {
		await this.service.restoreBoard(req.params.boardId as string);
		return res.json({ success: true, data: null });
	}

	async deleteBoard(req: Request, res: Response): Promise<Response> {
		await this.service.deleteBoard(req.params.boardId as string);
		return res.json({ success: true, data: null });
	}

	async getBoardMembers(req: Request, res: Response): Promise<Response> {
		const result = await this.service.getBoardMembers(req.params.boardId as string);
		return res.json({
			success: true,
			data: result.map((member) => new GetBoardMembersResponseDto(member)),
		});
	}

	async changeRoleOfMemberBoard(req: Request, res: Response): Promise<Response> {
		await this.service.changeRoleOfMemberBoard(
			req.params.boardId as string,
			req.body.userId,
			req.body.roleId,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}

	async removeMember(req: Request, res: Response): Promise<Response> {
		await this.service.removeMember(
			req.params.boardId as string,
			req.body.userId,
			req.user!.id!,
		);
		return res.json({ success: true, data: null });
	}

	private pagination(page: { totalItems: number; page: number; limit: number }) {
		return {
			totalItems: page.totalItems,
			itemsPerPage: page.limit,
			currentPage: page.page,
			totalPages: Math.ceil(page.totalItems / page.limit),
		};
	}
}
