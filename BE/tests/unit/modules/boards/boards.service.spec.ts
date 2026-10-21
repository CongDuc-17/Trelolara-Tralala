import { BoardsService } from '@/modules/boards/boards.service';
import { BoardsRepository } from '@/modules/boards/boards.repository';
import { BoardMembersRepository } from '@/modules/boardMembers/boardMember.repository';
import type { BackgroundStorage } from '@/modules/boards/boards.types';

describe('BoardsService business rules', () => {
	function setup() {
		const now = new Date('2026-10-21T00:00:00Z');
		const board = {
			id: 'board',
			projectId: 'project',
			name: 'Board',
			description: null,
			background: null,
			status: 'ACTIVE',
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
			_count: { boardMembers: 1, lists: 0 },
		};
		const client = {};
		const repository = {
			inTransaction: jest.fn(),
			lockProject: jest.fn(),
			lockBoard: jest.fn(),
			getProject: jest
				.fn()
				.mockResolvedValue({ id: 'project', status: 'ACTIVE', deletedAt: null }),
			getBoardById: jest.fn().mockResolvedValue(board),
			findRole: jest.fn().mockResolvedValue({
				id: 'admin-role',
				name: 'BOARD_ADMIN',
				status: 'ACTIVE',
			}),
			createBoard: jest.fn().mockResolvedValue(board),
			updateBoard: jest.fn().mockResolvedValue(board),
			archiveBoard: jest.fn(),
			deleteBoard: jest.fn(),
			getActorRole: jest
				.fn()
				.mockResolvedValue({ id: 'project-admin', name: 'PROJECT_ADMIN' }),
			isAdministrator: jest.fn().mockResolvedValue(true),
		};
		repository.inTransaction.mockImplementation((work) => work(repository, client));
		const members = {
			assignUserRoleBoard: jest.fn(),
			isUserMemberOfBoard: jest
				.fn()
				.mockResolvedValue({ role: { name: 'BOARD_ADMIN' } }),
			countAdministrators: jest.fn().mockResolvedValue(1),
			changeRoleOfMemberBoard: jest.fn(),
			removeMember: jest.fn(),
		};
		const storage: BackgroundStorage = {
			upload: jest.fn(),
			delete: jest.fn(),
			extractPublicId: jest.fn(),
		};
		const service = new BoardsService(
			repository as unknown as BoardsRepository,
			members as unknown as BoardMembersRepository,
			storage,
		);
		return { service, repository, members, client, board, storage };
	}

	it('creates the board and its first administrator using the same transaction client', async () => {
		const { service, repository, members, client } = setup();
		await expect(
			service.createBoard('project', { name: 'Board' }, 'creator'),
		).resolves.toMatchObject({
			id: 'board',
			memberCount: 1,
			roleName: 'BOARD_ADMIN',
		});
		expect(repository.lockProject).toHaveBeenCalledWith('project');
		expect(members.assignUserRoleBoard).toHaveBeenCalledWith(
			'board',
			'creator',
			'admin-role',
			client,
		);
		expect(repository.createBoard.mock.invocationCallOrder[0]).toBeGreaterThan(
			repository.lockProject.mock.invocationCallOrder[0],
		);
	});

	it('propagates a membership failure out of the creation transaction', async () => {
		const { service, repository, members } = setup();
		members.assignUserRoleBoard.mockRejectedValueOnce(
			new Error('membership write failed'),
		);
		await expect(
			service.createBoard('project', { name: 'Board' }, 'creator'),
		).rejects.toThrow('membership write failed');
		expect(repository.inTransaction).toHaveBeenCalledTimes(1);
	});

	it('does not create or upload under an archived project', async () => {
		const { service, repository, storage } = setup();
		repository.getProject.mockResolvedValue({ status: 'ARCHIVED' });
		await expect(
			service.createBoard('project', { name: 'Board' }, 'creator'),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			service.uploadBackground('board', {
				buffer: Buffer.from('image'),
				mimetype: 'image/png',
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(repository.createBoard).not.toHaveBeenCalled();
		expect(storage.upload).not.toHaveBeenCalled();
	});

	it('keeps archived boards readable with inherited project membership', async () => {
		const { service, repository, board } = setup();
		repository.getBoardById.mockResolvedValue({ ...board, status: 'ARCHIVED' });
		repository.getProject.mockResolvedValue({ status: 'ARCHIVED' });
		await expect(
			service.getBoardById('board', 'project-admin'),
		).resolves.toMatchObject({ status: 'ARCHIVED', roleName: 'PROJECT_ADMIN' });
	});

	it('prevents edits and restore when the parent is archived without changing child statuses', async () => {
		const { service, repository, board } = setup();
		repository.getProject.mockResolvedValue({ status: 'ARCHIVED' });
		repository.getBoardById.mockResolvedValue({ ...board, status: 'ARCHIVED' });
		await expect(
			service.updateBoard('board', { name: 'Updated' }),
		).rejects.toMatchObject({ status: 409 });
		await expect(service.restoreBoard('board')).rejects.toMatchObject({
			status: 409,
		});
		expect(repository.updateBoard).not.toHaveBeenCalled();
	});

	it('allows deletion of an archived board and propagates a failed tree deletion', async () => {
		const { service, repository, board } = setup();
		repository.getBoardById.mockResolvedValue({ ...board, status: 'ARCHIVED' });
		repository.deleteBoard.mockRejectedValue(new Error('child delete failed'));
		await expect(service.deleteBoard('board')).rejects.toThrow('child delete failed');
		expect(repository.lockBoard).toHaveBeenCalledWith('board');
	});

	it('preserves the last administrator for both demotion and removal', async () => {
		const { service, repository, members } = setup();
		repository.findRole.mockResolvedValue({
			id: 'member-role',
			name: 'BOARD_MEMBER',
			status: 'ACTIVE',
		});
		await expect(
			service.changeRoleOfMemberBoard('board', 'admin', 'member-role', 'actor'),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			service.removeMember('board', 'admin', 'actor'),
		).rejects.toMatchObject({ status: 409 });
		expect(members.changeRoleOfMemberBoard).not.toHaveBeenCalled();
		expect(members.removeMember).not.toHaveBeenCalled();
	});

	it('requires an actual administrator to grant or remove an admin role', async () => {
		const { service, repository, members } = setup();
		repository.isAdministrator.mockResolvedValue(false);
		members.countAdministrators.mockResolvedValue(2);
		await expect(
			service.changeRoleOfMemberBoard('board', 'member', 'admin-role', 'actor'),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			service.removeMember('board', 'admin', 'actor'),
		).rejects.toMatchObject({ status: 403 });
	});

	it.each(['PROJECT_MEMBER', 'USER'])(
		'rejects a %s role before persisting membership changes',
		async (name) => {
			const { service, repository, members } = setup();
			repository.findRole.mockResolvedValue({
				id: 'wrong-role',
				name,
				status: 'ACTIVE',
			});
			await expect(
				service.changeRoleOfMemberBoard('board', 'member', 'wrong-role', 'actor'),
			).rejects.toMatchObject({ status: 422 });
			expect(members.changeRoleOfMemberBoard).not.toHaveBeenCalled();
		},
	);

	it('uses the locked transaction for membership mutation and last-admin count', async () => {
		const { service, repository, members, client } = setup();
		members.countAdministrators.mockResolvedValue(2);
		await service.removeMember('board', 'admin', 'actor');
		expect(members.countAdministrators).toHaveBeenCalledWith('board', client);
		expect(members.removeMember).toHaveBeenCalledWith(
			'board',
			'admin',
			'actor',
			client,
		);
		expect(members.countAdministrators.mock.invocationCallOrder[0]).toBeGreaterThan(
			repository.lockBoard.mock.invocationCallOrder[0],
		);
	});

	it('allows only one of two serialized concurrent removals when two admins remain', async () => {
		const { service, repository, members } = setup();
		let count = 2;
		let queue: Promise<unknown> = Promise.resolve();
		// Simulate the parent row lock: each transaction observes the previous commit.
		repository.inTransaction.mockImplementation((work) => {
			const running = queue.then(() => work(repository, {}));
			queue = running.catch(() => undefined);
			return running;
		});
		members.countAdministrators.mockImplementation(async () => count);
		members.removeMember.mockImplementation(async () => {
			count -= 1;
		});
		const results = await Promise.allSettled([
			service.removeMember('board', 'admin-1', 'system-admin'),
			service.removeMember('board', 'admin-2', 'system-admin'),
		]);
		expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
		expect(count).toBe(1);
		expect(members.removeMember).toHaveBeenCalledTimes(1);
	});
});
