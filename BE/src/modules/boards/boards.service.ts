import {
	HttpResponseBodySuccessDto,
	InternalServerException,
	NotFoundException,
	ObjectComparerDto,
	OptionalException,
	PaginationDto,
	PaginationUtils,
} from '@/common';
import { BoardsRepository } from './boards.repository';

import { BoardStatusEnum, RoleStatusEnum } from '@prisma/client';

import { RolesRepository } from '../roles/roles.repository';
import { Forbidden } from '@tsed/exceptions';
import { BoardMembersRepository } from '../boardMembers/boardMember.repository';
import {
	CreateBoardRequestDto,
	UpdateInformationBoardRequestDto,
	BoardsResponseDto,
	UpdateBoardResponseDto,
	GetBoardMembersResponseDto,
} from './dtos';
import { BoardRoleEnum } from '@/common/enums/roles';
import { ProjectsRepository } from '../projects/project.repository';
import { ProjectMembersRepository } from '../projectMembers/projectMember.repository';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
	uploadImageFromBuffer,
} from '@/common/utils/cloudinary.utils';
import { UploadApiResponse } from 'cloudinary';
import { GetBoardsOfProjectRequestDto } from '../projects/dtos/requests';
import { GetBoardResponseDto } from './dtos/responses/getBoard.response';

export class BoardsService {
	constructor(
		private readonly projectsRepository: ProjectsRepository = new ProjectsRepository(),
		private readonly projectMembersRepository: ProjectMembersRepository = new ProjectMembersRepository(),
		private readonly boardsRepository: BoardsRepository = new BoardsRepository(),
		private readonly boardMembersRepository: BoardMembersRepository = new BoardMembersRepository(),
		private readonly rolesRepository: RolesRepository = new RolesRepository(),
	) {}

	async createBoard(
		projectId: string,
		createBoard: CreateBoardRequestDto,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<GetBoardResponseDto>> {
		const boardAdminRole = await this.rolesRepository.findByName(
			BoardRoleEnum.BOARD_ADMIN,
		);
		if (!boardAdminRole) {
			throw new NotFoundException('Board admin role not found');
		}

		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const isMemberProject = await this.projectMembersRepository.isUserMemberOfProject(
			projectId,
			userId,
		);
		if (!isMemberProject) {
			throw new Forbidden('You are not a member of this project');
		}

		const board = await this.boardsRepository.createBoard(
			projectId,
			createBoard.name,
			createBoard.description,
		);

		await this.boardMembersRepository.assignUserRoleBoard(
			board.id,
			userId,
			boardAdminRole.id,
		);
		const boardWithMembers = await this.boardsRepository.getBoardById(board.id);
		if (!boardWithMembers) {
			throw new NotFoundException('Board not found');
		}
		return {
			success: true,
			data: new GetBoardResponseDto({
				id: board.id,
				name: board.name,
				description: board.description ?? undefined,
				projectId: board.projectId,
				status: board.status,
				background: board.background ?? undefined,
				roleId: boardAdminRole.id,
				roleName: boardAdminRole.name,
				memberCount: boardWithMembers._count.boardMembers ?? 1,
				listCount: boardWithMembers._count.lists ?? 0,
				createdAt: board.createdAt,
				updatedAt: board.updatedAt,
			}),
		};
	}

	async getBoardsOfUserInProject(
		projectId: string,
		userId: string,
		getBoardsOfProjectRequestDto: GetBoardsOfProjectRequestDto,
		pagination: PaginationDto,
	): Promise<HttpResponseBodySuccessDto<BoardsResponseDto[]>> {
		const project = await this.projectsRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}
		const { status } = getBoardsOfProjectRequestDto;
		const paginationUtils = new PaginationUtils().extractSkipTakeFromPagination(
			pagination,
		);

		const [boards, totalBoards] =
			await this.boardMembersRepository.getBoardsOfUserInProject({
				projectId,
				userId,
				status: status as BoardStatusEnum,
				skip: paginationUtils.skip,
				take: paginationUtils.take,
			});

		const boardDtos = boards.map(
			(board) =>
				new BoardsResponseDto({
					projectId: projectId,
					id: board.boardId,
					name: board.board.name,
					description: board.board.description ?? undefined,
					background: board.board.background ?? undefined,
					status: board.board.status,
					_count: {
						lists: board.board._count.lists,
						members: board.board._count.boardMembers,
					},
				}),
		);

		return {
			success: true,
			data: boardDtos,
			pagination:
				paginationUtils.convertPaginationResponseDtoFromTotalRecords(totalBoards),
		};
	}

	async getBoardById(
		boardId: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<GetBoardResponseDto>> {
		const isMember = await this.boardMembersRepository.isUserMemberOfBoard(
			boardId,
			userId,
		);
		if (!isMember) {
			throw new Forbidden('You are not a member of this board');
		}
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}

		return {
			success: true,
			data: new GetBoardResponseDto({
				id: board.id,
				name: board.name,
				description: board.description ?? undefined,
				projectId: board.projectId,
				status: board.status,
				background: board.background ?? undefined,
				roleId: isMember.roleId,
				roleName: isMember.role.name,
				memberCount: board._count.boardMembers,
				listCount: board._count.lists,
				createdAt: board.createdAt,
				updatedAt: board.updatedAt,
			}),
		};
	}

	async updateBoard(
		boardId: string,
		data: UpdateInformationBoardRequestDto,
	): Promise<HttpResponseBodySuccessDto<UpdateBoardResponseDto>> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const updatedBoard = await this.boardsRepository.updateBoard(boardId, {
			name: data.name ?? board.name,
			description: data.description ?? board.description,
		});

		return {
			success: true,
			data: new UpdateBoardResponseDto({
				id: updatedBoard.id,
				name: updatedBoard.name,
				description: updatedBoard.description ?? undefined,
				projectId: updatedBoard.projectId,
			}),
		};
	}

	async uploadBackground(
		boardId: string,
		file: Express.Multer.File,
	): Promise<HttpResponseBodySuccessDto<UpdateBoardResponseDto>> {
		let uploaded: UploadApiResponse | null = null;
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}

		try {
			uploaded = await uploadImageFromBuffer(
				file.buffer,
				file.mimetype,
				'TrelloLike_BoardBackgrounds',
			);
			const oldPublicId = board.background
				? extractPublicIdFromUrl(board.background)
				: null;
			board.background = uploaded.secure_url;
			await this.boardsRepository.updateBoard(boardId, {
				background: board.background,
			});
			if (oldPublicId) {
				await deleteImageFromCloudinary(oldPublicId);
			}

			return {
				success: true,
				data: new UpdateBoardResponseDto({
					...board,
					description: board.description ?? undefined,
					background: board.background ?? undefined,
				}),
			};
		} catch (error) {
			console.error('Error occurred while uploading background:', error);
			if (uploaded?.public_id) {
				await deleteImageFromCloudinary(uploaded.public_id);
			}
			throw new InternalServerException();
		}
	}

	async archiveBoard(boardId: string): Promise<HttpResponseBodySuccessDto<null>> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}

		await this.boardsRepository.updateBoard(boardId, {
			status: BoardStatusEnum.ARCHIVED,
		});
		return {
			success: true,
			data: null,
		};
	}

	async restoreBoard(boardId: string): Promise<HttpResponseBodySuccessDto<null>> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		if (board.status !== BoardStatusEnum.ARCHIVED) {
			throw new OptionalException(400, 'Only archived boards can be restored');
		}
		await this.boardsRepository.updateBoard(boardId, {
			status: BoardStatusEnum.ACTIVE,
			deletedAt: null,
		});
		return {
			success: true,
			data: null,
		};
	}

	async deleteBoard(boardId: string): Promise<HttpResponseBodySuccessDto<null>> {
		try {
			const board = await this.boardsRepository.getBoardById(boardId);
			if (!board) {
				throw new NotFoundException('Board not found');
			}
			await this.boardsRepository.deleteBoard(boardId);
			return {
				success: true,
				data: null,
			};
		} catch (error) {
			console.error('Error occurred while deleting board:', error);
			if (error instanceof NotFoundException) {
				throw error;
			}
			throw new InternalServerException();
		}
	}

	async getBoardMembers(
		boardId: string,
	): Promise<HttpResponseBodySuccessDto<GetBoardMembersResponseDto[]>> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const members = await this.boardMembersRepository.getBoardMembers(boardId);
		const memberDtos = members.map(
			(m) =>
				new GetBoardMembersResponseDto({
					boardId: m.boardId,
					userId: m.userId,
					name: m.user.name,
					email: m.user.email,
					avatar: m.user.avatar ?? '',
					roleId: m.roleId,
					roleName: m.role.name,
				}),
		);
		return {
			success: true,
			data: memberDtos,
		};
	}

	async changeRoleOfMemberBoard(
		boardId: string,
		userId: string,
		newRoleId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const existingBoard = await this.boardsRepository.getBoardById(boardId);
		if (!existingBoard) {
			throw new NotFoundException('Board not found');
		}

		const role = await new RolesRepository().findById(newRoleId);

		if (!role) {
			throw new NotFoundException('Role not found');
		}
		if (role.status === RoleStatusEnum.INACTIVE) {
			throw new OptionalException(400, 'Role is inactive');
		}
		// Check xem role có phù hợp với phạm vi Board không (bắt đầu với BOARD_)
		if (!role.name.startsWith('BOARD_')) {
			throw new OptionalException(400, 'Role must be a board role (BOARD_*)');
		}
		if (role.name === BoardRoleEnum.BOARD_ADMIN) {
			throw new OptionalException(400, 'Cannot assign board admin role');
		}

		const isMember = await this.boardMembersRepository.isUserMemberOfBoard(
			boardId,
			userId,
		);
		if (!isMember) {
			throw new Forbidden('You are not a member of this board');
		}

		await this.boardMembersRepository.changeRoleOfMemberBoard(
			boardId,
			userId,
			newRoleId,
		);
		return {
			success: true,
			data: null,
		};
	}

	async removeMember(
		boardId: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<null>> {
		const existingBoard = await this.boardsRepository.getBoardById(boardId);
		if (!existingBoard) {
			throw new NotFoundException('Board not found');
		}
		const isMember = await this.boardMembersRepository.isUserMemberOfBoard(
			boardId,
			userId,
		);
		if (!isMember) {
			throw new Forbidden('You are not a member of this board');
		}
		await this.boardMembersRepository.removeMember(boardId, userId);
		return {
			success: true,
			data: null,
		};
	}
}
