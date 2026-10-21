import { deleteBoardTree } from '@/modules/boards/board-deletion';
import { DatabaseClient } from '@/modules/database';
import { ProjectsRepository } from '@/modules/projects/project.repository';

jest.mock('@/modules/boards/board-deletion', () => ({ deleteBoardTree: jest.fn() }));

const now = new Date('2026-10-21T00:00:00Z');
const grace = 15 * 24 * 60 * 60 * 1000;

function setup(
	options: {
		failBoard?: boolean;
		failCommit?: boolean;
		deletedAt?: Date;
		status?: string;
	} = {},
) {
	const events: string[] = [];
	let committed: string[] = [];
	let transaction: DatabaseClient;
	const client = {
		projects: { findMany: jest.fn(async () => [{ id: 'project' }]) },
		$transaction: jest.fn(async (work: (tx: DatabaseClient) => Promise<unknown>) => {
			const draft: string[] = [];
			transaction = {
				$queryRaw: jest.fn(async () => {
					events.push('lock');
				}),
				projects: {
					findUnique: jest.fn(async () => ({
						id: 'project',
						status: options.status ?? 'DELETED',
						deletedAt: options.deletedAt ?? new Date(now.getTime() - grace),
					})),
					delete: jest.fn(async () => {
						events.push('project');
						draft.push('project');
					}),
				},
				boards: {
					findMany: jest.fn(async () => [{ id: 'board-a' }, { id: 'board-b' }]),
					delete: jest.fn(async ({ where }: { where: { id: string } }) => {
						events.push(where.id);
						draft.push(where.id);
						if (where.id === 'board-b' && options.failBoard)
							throw new Error('board deletion failed');
					}),
				},
				invitations: {
					deleteMany: jest.fn(async () => {
						events.push('invitations');
						draft.push('invitations');
					}),
				},
				projectMembers: {
					deleteMany: jest.fn(async () => {
						events.push('members');
						draft.push('members');
					}),
				},
			} as unknown as DatabaseClient;
			try {
				const result = await work(transaction);
				if (options.failCommit) throw new Error('commit failed');
				committed = draft;
				return result;
			} catch (error) {
				events.push('rollback');
				throw error;
			}
		}),
	};
	jest.mocked(deleteBoardTree).mockImplementation(async (tx, boardId) => {
		expect(tx).toBe(transaction);
		await tx.boards.delete({ where: { id: boardId } });
	});
	return {
		repository: new ProjectsRepository(client as unknown as DatabaseClient),
		client,
		events,
		committed: () => committed,
	};
}

it('purges each board tree, project invitations, membership and project in one transaction after the 15-day grace period', async () => {
	const test = setup();
	await test.repository.deleteProject('project', now);
	expect(test.client.$transaction).toHaveBeenCalledTimes(1);
	expect(test.events).toEqual([
		'lock',
		'board-a',
		'board-b',
		'invitations',
		'members',
		'project',
	]);
	expect(test.committed()).toEqual(test.events.slice(1));
});

it.each([{ failBoard: true }, { failCommit: true }])(
	'rolls back the entire project tree if a child delete or commit fails: %j',
	async (options) => {
		const test = setup(options);
		await expect(test.repository.deleteProject('project', now)).rejects.toThrow();
		expect(test.committed()).toEqual([]);
		expect(test.events[test.events.length - 1]).toBe('rollback');
	},
);

it.each([
	{ status: 'ACTIVE' },
	{ status: 'ARCHIVED' },
	{ deletedAt: new Date(now.getTime() - grace + 1) },
])('rejects ineligible purge before deleting children: %j', async (options) => {
	const test = setup(options);
	await expect(test.repository.deleteProject('project', now)).rejects.toMatchObject({
		status: 400,
	});
	expect(test.events).toEqual(['lock', 'rollback']);
});

it('cleanup selects only soft-deleted projects older than 15 days', async () => {
	const test = setup();
	await expect(test.repository.cleanupExpiredProjects(now)).resolves.toBe(1);
	expect(test.client.projects.findMany).toHaveBeenCalledWith({
		where: { status: 'DELETED', deletedAt: { lte: new Date(now.getTime() - grace) } },
		select: { id: true },
		orderBy: { id: 'asc' },
	});
});
