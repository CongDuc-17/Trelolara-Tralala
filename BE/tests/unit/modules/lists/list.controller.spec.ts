import type { Request, Response } from 'express';
import { ListsController } from '@/modules/lists/list.controller';
import type { ListsService } from '@/modules/lists/list.service';
import { listResponseDtoSchema } from '@/modules/lists/dtos';

jest.mock('@/modules/lists/list.service', () => ({ ListsService: jest.fn() }));

const list = {
	id: 'd19f9893-2ad5-4684-b7b5-718d2ab1f73b',
	boardId: 'b639d86a-40d7-4624-ab80-9a66db9256c4',
	name: 'Ready',
	position: 1.5,
	status: 'ACTIVE' as const,
	createdAt: new Date('2026-10-21T00:00:00Z'),
	updatedAt: new Date('2026-10-21T01:00:00Z'),
	deletedAt: null,
};

function setup() {
	const service = {
		getAllListsByBoardId: jest.fn().mockResolvedValue([list]),
		createList: jest.fn().mockResolvedValue(list),
		moveList: jest.fn().mockResolvedValue(list),
		updateListName: jest.fn().mockResolvedValue(list),
		archiveList: jest.fn().mockResolvedValue(list),
		restoreList: jest.fn().mockResolvedValue(list),
		deleteList: jest.fn().mockResolvedValue(undefined),
	};
	const response = { json: jest.fn().mockReturnThis() };
	return {
		controller: new ListsController(service as unknown as ListsService),
		service,
		response,
		res: response as unknown as Response,
		request: {
			params: { listId: list.id, boardId: list.boardId },
			query: {},
			body: {},
		} as unknown as Request,
	};
}

describe('ListsController FE contract', () => {
	it('retains the array envelope and full list row, including lifecycle fields', async () => {
		const { controller, service, request, res, response } = setup();
		request.query = { status: 'ARCHIVED' };
		await controller.getAllListsByBoardId(request, res);
		expect(service.getAllListsByBoardId).toHaveBeenCalledWith(
			list.boardId,
			'ARCHIVED',
		);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: [list] });
		expect(listResponseDtoSchema.parse(list)).toEqual(list);
	});

	it('creates a list using the parsed name and board ID', async () => {
		const { controller, service, request, res, response } = setup();
		request.body = { name: 'Ready' };
		await controller.createList(request, res);
		expect(service.createList).toHaveBeenCalledWith('Ready', list.boardId);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: list });
	});

	it('moves without a redundant lookup and preserves the optional neighbor arguments', async () => {
		const { controller, service, request, res, response } = setup();
		request.body = { afterListId: '4145f830-04fd-47b9-b2e0-001048f6273d' };
		await controller.moveList(request, res);
		expect(service.moveList).toHaveBeenCalledWith(
			list.id,
			undefined,
			request.body.afterListId,
		);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: list });
	});

	it('retains the rename body and result envelope', async () => {
		const { controller, service, request, res, response } = setup();
		request.body = { name: 'Done' };
		await controller.updateList(request, res);
		expect(service.updateListName).toHaveBeenCalledWith('Done', list.id);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: list });
	});

	it.each(['archiveList', 'restoreList'] as const)(
		'retains the list row returned by %s',
		async (method) => {
			const { controller, service, request, res, response } = setup();
			await controller[method](request, res);
			expect(service[method]).toHaveBeenCalledWith(list.id);
			expect(response.json).toHaveBeenCalledWith({ success: true, data: list });
		},
	);

	it('keeps the null deletion envelope', async () => {
		const { controller, service, request, res, response } = setup();
		await controller.deleteList(request, res);
		expect(service.deleteList).toHaveBeenCalledWith(list.id);
		expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
	});

	it('propagates an application error for the common error middleware', async () => {
		const { controller, service, request, res, response } = setup();
		const conflict = Object.assign(new Error('List is archived'), { status: 409 });
		service.moveList.mockRejectedValueOnce(conflict);
		await expect(controller.moveList(request, res)).rejects.toBe(conflict);
		expect(response.json).not.toHaveBeenCalled();
	});
});
