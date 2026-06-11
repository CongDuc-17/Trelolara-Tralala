import { Request, Response } from 'express';
import { BoardsService } from './boards.service';
import {
	CreateBoardRequestDto,
	BoardsResponseDto,
	UserBoardResponseDto,
	UpdateBoardResponseDto,
	UpdateInformationBoardRequestDto,
	GetBoardMembersResponseDto,
} from './dtos';
import { Exception } from '@tsed/exceptions';
import { HttpResponseDto, OptionalException, PaginationDto } from '@/common';
import { boardMembers } from '@/models/modelSchema/boardMembersSchema';
import { StatusCodes } from 'http-status-codes';
import { GetBoardsOfProjectRequestDto } from '../projects/dtos/requests';
import { GetBoardResponseDto } from './dtos/responses/getBoard.response';

export class BoardsController {
	constructor(private boardsService: BoardsService = new BoardsService()) {}

	async getMyBoards(req: Request): Promise<Response> {
		const pagination: PaginationDto = new PaginationDto(req.query);
		const status: GetBoardsOfProjectRequestDto = new GetBoardsOfProjectRequestDto(
			req.query,
		);
		const userId = (req.user as { id: string }).id;
		const result = await this.boardsService.getBoardsOfUser(
			userId,
			status,
			pagination,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<UserBoardResponseDto[]>(result);
	}

	async createBoard(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const createBoardDto = new CreateBoardRequestDto(req.body);

		const userId = (req.user as { id: string }).id;
		const result = await this.boardsService.createBoard(
			projectId,
			createBoardDto,
			userId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetBoardResponseDto>(result);
	}

	async getBoards(req: Request): Promise<Response> {
		const projectId = req.params.projectId as string;
		const pagination: PaginationDto = new PaginationDto(req.query);

		const status: GetBoardsOfProjectRequestDto = new GetBoardsOfProjectRequestDto(
			req.query,
		);
		const userId = (req.user as { id: string }).id;
		const result = await this.boardsService.getBoardsOfUserInProject(
			projectId,
			userId,
			status,
			pagination,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<BoardsResponseDto[]>(result);
	}

	async getBoardById(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const userId = (req.user as { id: string }).id;
		const result = await this.boardsService.getBoardById(boardId, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetBoardResponseDto>(result);
	}

	async updateBoardInformation(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const updateBoardDto = new UpdateInformationBoardRequestDto(req.body);
		const result = await this.boardsService.updateBoard(boardId, updateBoardDto);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<UpdateBoardResponseDto>(result);
	}

	async uploadBackground(req: Request, res: Response): Promise<Response> {
		const boardId = req.params.boardId as string;
		const file = req.file as Express.Multer.File;
		if (!file) {
			return new HttpResponseDto().exception(
				new OptionalException(400, 'File is required'),
			);
		}

		const result = await this.boardsService.uploadBackground(boardId, file);
		if (result instanceof Exception) {
			return res.status(result.status || 400).json({
				success: false,
				message: result.message,
			});
		}
		return res.status(StatusCodes.OK).json({
			success: true,
			data: result.data,
		});
	}

	async archiveBoard(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const userId = (req.user as { id: string }).id;
		const result = await this.boardsService.archiveBoard(boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async restoreBoard(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;

		const result = await this.boardsService.restoreBoard(boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async deleteBoard(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;

		const result = await this.boardsService.deleteBoard(boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async getBoardMembers(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const result = await this.boardsService.getBoardMembers(boardId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<GetBoardMembersResponseDto[]>(result);
	}

	async changeRoleOfMemberBoard(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const { userId, roleId } = req.body;

		const result = await this.boardsService.changeRoleOfMemberBoard(
			boardId,
			userId,
			roleId,
		);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async removeMember(req: Request): Promise<Response> {
		const boardId = req.params.boardId as string;
		const { userId } = req.body;
		const result = await this.boardsService.removeMember(boardId, userId);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}
}
