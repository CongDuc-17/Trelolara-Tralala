import { Request, Response } from 'express';

import {
	GetUserByUserIdRequestDto,
	GetUserResponseDto,
	GetUsersRequestDto,
	GetUsersResponseDto,
	UpdateMyInformationRequestDto,
	UpdateMyPasswordRequestDto,
} from './dtos';
import { UsersService } from './users.service';
import { UserProfile } from './users.types';

import { PaginationDto } from '@/common/dtos/pagination.dto';

export class UsersController {
	constructor(private readonly usersService = new UsersService()) {}

	async getUsers(req: Request, res: Response): Promise<Response> {
		const result = await this.usersService.getUsers(
			new GetUsersRequestDto(req.query),
			new PaginationDto(req.query),
		);
		return res.status(200).json({
			success: true,
			data: result.items.map((user) => new GetUsersResponseDto(user)),
			pagination: {
				totalItems: result.totalItems,
				itemsPerPage: result.limit,
				currentPage: result.page,
				totalPages: Math.ceil(result.totalItems / result.limit),
			},
		});
	}

	async getUserByUserId(req: Request, res: Response): Promise<Response> {
		const { userId } = req.params as { userId: string };
		const user = await this.usersService.getUserByUserId(
			new GetUserByUserIdRequestDto(userId, req.query),
		);
		return res
			.status(200)
			.json({ success: true, data: new GetUserResponseDto(user) });
	}

	getMyInformation(req: Request, res: Response): Response {
		return res.status(200).json({
			success: true,
			data: new GetUserResponseDto(req.user as UserProfile),
		});
	}

	async updateMyInformation(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserProfile;
		const user = await this.usersService.updateMyInformation(
			new UpdateMyInformationRequestDto(req.body),
			actor.id,
			req.file,
		);
		return res
			.status(200)
			.json({ success: true, data: new GetUserResponseDto(user) });
	}

	async updateMyPassword(req: Request, res: Response): Promise<Response> {
		const { newPassword } = new UpdateMyPasswordRequestDto(req.body);
		const user = await this.usersService.updateMyPassword(
			newPassword,
			req.user as UserProfile,
		);
		return res
			.status(200)
			.json({ success: true, data: new GetUserResponseDto(user) });
	}
}
