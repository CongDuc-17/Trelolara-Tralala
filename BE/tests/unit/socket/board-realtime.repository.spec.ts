import { BoardRealtimeRepository } from '@/socket/board-realtime.repository';
import type { DatabaseClient } from '@/modules/database';

describe('board realtime permission snapshots', () => {
	function fixture() {
		const boards = {
			findUnique: jest
				.fn()
				.mockResolvedValue({ id: 'board', projectId: 'project' }),
		};
		const roles = { findMany: jest.fn().mockResolvedValue([]) };
		const boardChanges = {
			findUnique: jest
				.fn()
				.mockResolvedValue({ revision: BigInt('9007199254740993') }),
		};
		const client = { boards, roles, boardChanges } as unknown as DatabaseClient;
		return {
			boards,
			roles,
			boardChanges,
			repository: new BoardRealtimeRepository(client),
		};
	}
	it('does not expose a revision without GET_BOARD', async () => {
		const f = fixture();
		expect(await f.repository.snapshot('user', 'board')).toBeNull();
		expect(f.boardChanges.findUnique).not.toHaveBeenCalled();
	});
	it('supports legacy viewer membership and serializes BIGINT without precision loss', async () => {
		const f = fixture();
		f.roles.findMany.mockImplementation(async ({ where }) =>
			where.boardMembers
				? [
						{
							name: 'BOARD_VIEWER',
							rolesPermissions: [{ permission: { name: 'GET_BOARD' } }],
						},
					]
				: [],
		);
		expect(await f.repository.snapshot('user', 'board')).toBe('9007199254740993');
	});
	it('does not let system ADMIN subscribe to a missing board', async () => {
		const f = fixture();
		f.boards.findUnique.mockResolvedValue(null);
		f.roles.findMany.mockResolvedValue([{ name: 'ADMIN', rolesPermissions: [] }]);
		expect(await f.repository.snapshot('admin', 'board')).toBeNull();
	});
});
