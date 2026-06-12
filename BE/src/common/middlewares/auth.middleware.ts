import { UserStatusEnum } from '@prisma/client';
import { ClientException, Exception, NotFound } from '@tsed/exceptions';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JsonWebTokenError, TokenExpiredError, verify } from 'jsonwebtoken';

import { UsersRepository } from '@/modules/users/users.repository';

import {
	ForbiddenException,
	InternalServerException,
	NotFoundException,
	OptionalException,
	UnauthorizedException,
} from '../exceptions';
import { ITokenPayload } from '../interfaces';

import { BaseAutoBindMiddleware } from './baseAutoBindmiddleware';

import { jwtConfig } from '@/configs';
import { UserInformationDto } from '@/modules/users/dtos';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import { PrismaService } from '@/modules/database/prisma.service';
class AuthMiddleware extends BaseAutoBindMiddleware {
	constructor(private readonly userRepository = new UsersRepository()) {
		super();
	}
	private readonly permissionsRepository = new PermissionsRepository();
	private readonly prismaService = new PrismaService();

	async verifyAccessToken(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void | Exception> {
		const cookies = req.headers.cookie;
		const accessToken = cookies
			?.split('; ')
			.find((row) => row.startsWith('accessToken='))
			?.split('=')[1];
		let user: UserInformationDto;

		if (!accessToken) {
			throw new UnauthorizedException();
		}

		try {
			const payload: ITokenPayload = verify(
				accessToken,
				jwtConfig.secretAccessToken,
			) as ITokenPayload;
			const userData = await this.userRepository.findUser({
				userId: payload.userId,
				userStatus: UserStatusEnum.ACTIVE,
			});
			if (!userData) {
				throw new UnauthorizedException();
			}

			user = new UserInformationDto(userData);

			req.user = user;
		} catch (error) {
			if (error instanceof TokenExpiredError) {
				throw new OptionalException(StatusCodes.UNAUTHORIZED, error.message);
			}
			if (error instanceof JsonWebTokenError) {
				throw new UnauthorizedException(error.message);
			}
			throw new InternalServerException();
		}

		next();
	}

	async verifyRefreshToken(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void | Exception> {
		const cookies = req.headers.cookie;
		const accessToken = cookies
			?.split('; ')
			.find((row) => row.startsWith('accessToken='))
			?.split('=')[1];
		const refreshToken = cookies
			?.split('; ')
			.find((row) => row.startsWith('refreshToken='))
			?.split('=')[1];
		let user: UserInformationDto;

		if (!refreshToken || !accessToken) {
			throw new UnauthorizedException();
		}
		try {
			const payloadRefreshToken: ITokenPayload = verify(
				refreshToken,
				jwtConfig.secretRefreshToken,
			) as ITokenPayload;
			const payloadAccessToken: ITokenPayload = verify(
				accessToken,
				jwtConfig.secretAccessToken,
				{
					ignoreExpiration: true,
				},
			) as ITokenPayload;

			if (payloadAccessToken.exp > Date.now() / 1000) {
				throw new OptionalException(
					StatusCodes.CONFLICT,
					'Access token has not expired yet',
				);
			}

			const userData = await this.userRepository.findUser({
				userId: payloadRefreshToken.userId,
				userStatus: UserStatusEnum.ACTIVE,
			});
			if (!userData) {
				throw new UnauthorizedException();
			}

			user = new UserInformationDto(userData);

			req.user = user;
		} catch (error) {
			if (error instanceof TokenExpiredError) {
				throw new OptionalException(StatusCodes.UNAUTHORIZED, error.message);
			}
			if (error instanceof JsonWebTokenError) {
				throw new UnauthorizedException(error.message);
			}
			if (error instanceof ClientException) {
				throw error;
			}
		}

		next();
	}

	/// permission chung he thong: user->role->role_permission->
	/*
	Input: thong tin user, permission can check

	Lay permission cua user tu db(userId)
	kiem tra permission can cho API no co trong permission cua user khong
	
	Output:
	neu co thi next()
	khong thi throw exception
	*/

	verifySystemPermission(permission: string) {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				const user = req.user as UserInformationDto;
				if (!user?.id) {
					throw new UnauthorizedException('User not authenticated');
				}
				const hasPermission =
					await this.permissionsRepository.hasSystemPermission(user.id, [
						permission,
					]);
				console.log('Has system permission:', hasPermission);
				if (hasPermission) return next();
				throw new ForbiddenException();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyProjectPermission(...permissions: string[]) {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				const user = req.user as UserInformationDto;
				if (!user?.id) {
					throw new UnauthorizedException('User not authenticated');
				}

				// Lấy projectId từ params hoặc body
				let projectId = req.params.projectId as string;
				console.log('Project ID from params:', projectId);
				// Nếu không có projectId nhưng có boardId, lấy projectId từ board
				// if (!projectId && req.params.boardId) {
				// 	const board = await this.prismaService.boards.findUnique({
				// 		where: { id: req.params.boardId },
				// 		select: { projectId: true },
				// 	});
				// 	projectId = board?.projectId;
				// }

				if (!projectId) {
					throw new NotFoundException('Project ID not found');
				}

				const hasPermission = await this.permissionsRepository.checkAnyPermission(
					user.id,
					permissions,
					{ projectId },
				);
				console.log('Has project permission:', hasPermission);
				if (!hasPermission) {
					throw new ForbiddenException();
				}

				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyBoardPermission(...permissions: string[]) {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				const user = req.user as UserInformationDto;
				if (!user?.id) {
					throw new UnauthorizedException('User not authenticated');
				}

				let boardId = req.params.boardId as string;
				let listId = req.params.listId as string;
				let cardId = req.params.cardId as string;
				let checklistId = req.params.checklistId as string;
				let commentId = req.params.commentId as string;

				if (!cardId && commentId) {
					const comment = await this.prismaService.cardComments.findUnique({
						where: { id: commentId },
						select: { cardId: true },
					});
					if (comment) {
						cardId = comment.cardId;
					}
				}

				if (!cardId && checklistId) {
					const checklist = await this.prismaService.checklists.findUnique({
						where: { id: checklistId },
						select: { cardId: true },
					});
					if (checklist) {
						cardId = checklist.cardId;
					}
				}

				if (!listId && cardId) {
					const card = await this.prismaService.cards.findUnique({
						where: { id: cardId },
						select: { listId: true },
					});
					if (card) {
						listId = card.listId;
						console.log('Derived List ID from Card:', listId);
					}
				}
				if (!boardId && listId) {
					const list = await this.prismaService.lists.findUnique({
						where: { id: listId },

						select: { boardId: true, name: true },
					});
					if (list) {
						boardId = list.boardId;
					}
				}

				if (!boardId) {
					throw new NotFoundException('Board ID not found in verify');
				}

				const hasPermission = await this.permissionsRepository.checkAnyPermission(
					user.id,
					permissions,
					{ boardId },
				);
				console.log('Has board permission:', hasPermission);

				if (!hasPermission) {
					throw new ForbiddenException();
				}

				next();
			} catch (error) {
				next(error);
			}
		};
	}
}

export default new AuthMiddleware();
