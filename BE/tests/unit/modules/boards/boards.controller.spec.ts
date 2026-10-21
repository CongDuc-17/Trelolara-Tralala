import type { Request, Response } from 'express';
import { BoardsController } from '@/modules/boards/boards.controller';
import { BoardsService } from '@/modules/boards/boards.service';

describe('BoardsController FE contract', () => {
	it('retains board list response fields and pagination', async () => {
		const item = {
			id: 'board',
			projectId: 'project',
			name: 'Board',
			status: 'ACTIVE',
			membersCount: 2,
			listsCount: 3,
			projectName: 'Project',
			projectStatus: 'ACTIVE',
			roleId: 'role',
			roleName: 'BOARD_MEMBER',
		};
		const service = {
			getBoardsOfUser: jest
				.fn()
				.mockResolvedValue({ items: [item], totalItems: 12, page: 2, limit: 10 }),
		};
		const controller = new BoardsController(service as unknown as BoardsService);
		const response = { json: jest.fn().mockReturnThis() };
		await controller.getMyBoards(
			{ user: { id: 'user' }, query: { page: 2, limit: 10 } } as unknown as Request,
			response as unknown as Response,
		);
		expect(response.json).toHaveBeenCalledWith({
			success: true,
			data: [item],
			pagination: {
				totalItems: 12,
				itemsPerPage: 10,
				currentPage: 2,
				totalPages: 2,
			},
		});
	});

	it('retains null mutation envelopes and passes the actor when removing a member', async () => {
		const service = { removeMember: jest.fn() };
		const response = { json: jest.fn().mockReturnThis() };
		await new BoardsController(service as unknown as BoardsService).removeMember(
			{
				params: { boardId: 'board' },
				body: { userId: 'member' },
				user: { id: 'actor' },
			} as unknown as Request,
			response as unknown as Response,
		);
		expect(service.removeMember).toHaveBeenCalledWith('board', 'member', 'actor');
		expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
	});
});
