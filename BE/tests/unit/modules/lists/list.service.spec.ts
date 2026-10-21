import { ListsRepository } from '@/modules/lists/list.repository';
import { ListsService } from '@/modules/lists/list.service';
import type { ListBoardState, ListRecord } from '@/modules/lists/lists.types';
import type { DatabaseClient } from '@/modules/database';

const now = new Date('2026-10-21T00:00:00Z');

function list(
	id: string,
	position: number,
	changes: Partial<ListRecord> = {},
): ListRecord {
	return {
		id,
		position,
		name: id,
		boardId: 'board',
		status: 'ACTIVE',
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		...changes,
	};
}

// The fake serializes only explicit row locks, so missing parent locks expose duplicate positions.
function setup(initial: ListRecord[] = []) {
	let rows = initial.map((row) => ({ ...row }));
	let sequence = 0;
	let transactionCount = 0;
	const locks = new Map<string, Promise<void>>();
	const events: string[] = [];
	const failures: { create: boolean; positionId?: string } = { create: false };
	const board: { current: ListBoardState | null } = {
		current: {
			id: 'board',
			projectId: 'project',
			status: 'ACTIVE',
			deletedAt: null,
			project: { status: 'ACTIVE', deletedAt: null },
		},
	};

	function client(transactionId: number, acquire?: (key: string) => Promise<void>) {
		return {
			boards: {
				findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
					events.push(`${transactionId}:read-board`);
					return where.id === 'board' ? board.current : null;
				}),
			},
			$queryRaw: jest.fn(async (parts: TemplateStringsArray, id: string) => {
				const table = parts.join('?').match(/FROM "(\w+)"/)?.[1];
				const key = `${table}:${id}`;
				await acquire?.(key);
				events.push(`${transactionId}:lock:${key}`);
				return [];
			}),
			lists: {
				findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
					events.push(`${transactionId}:read-list`);
					return rows.find((row) => row.id === where.id) ?? null;
				}),
				findMany: jest.fn(
					async ({
						where,
					}: {
						where: { boardId: string; status?: string; deletedAt?: null };
					}) => {
						events.push(`${transactionId}:read-siblings`);
						return rows
							.filter(
								(row) =>
									row.boardId === where.boardId &&
									(where.status === undefined ||
										row.status === where.status) &&
									(where.deletedAt === undefined ||
										row.deletedAt === null),
							)
							.sort(
								(a, b) =>
									a.position - b.position || a.id.localeCompare(b.id),
							)
							.map((row) => ({ ...row }));
					},
				),
				create: jest.fn(
					async ({
						data,
					}: {
						data: { name: string; boardId: string; position: number };
					}) => {
						if (failures.create) throw new Error('create failed');
						const created = list(
							`created-${++sequence}`,
							data.position,
							data,
						);
						rows.push(created);
						return created;
					},
				),
				update: jest.fn(
					async ({
						where,
						data,
					}: {
						where: { id: string };
						data: Partial<ListRecord>;
					}) => {
						if (
							data.position !== undefined &&
							where.id === failures.positionId
						)
							throw new Error('position write failed');
						const index = rows.findIndex((row) => row.id === where.id);
						if (index < 0) throw new Error('missing list');
						rows[index] = { ...rows[index], ...data };
						events.push(`${transactionId}:write:${where.id}`);
						return rows[index];
					},
				),
				delete: jest.fn(async ({ where }: { where: { id: string } }) => {
					rows = rows.filter((row) => row.id !== where.id);
				}),
			},
			...Object.fromEntries(
				[
					'checklistItems',
					'checklists',
					'cardLabels',
					'cardMembers',
					'cardComments',
					'cardAttachments',
					'cardActivity',
					'cards',
				].map((table) => [
					table,
					{ deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
				]),
			),
		};
	}

	const transaction = jest.fn(
		async <T>(work: (scoped: DatabaseClient) => Promise<T>) => {
			const id = ++transactionCount;
			const held = new Map<string, () => void>();
			let snapshot: ListRecord[] | undefined;
			const scoped = client(id, async (key) => {
				if (held.has(key)) return;
				const previous = locks.get(key) ?? Promise.resolve();
				let release!: () => void;
				const pending = new Promise<void>((resolve) => {
					release = resolve;
				});
				locks.set(
					key,
					previous.then(() => pending),
				);
				await previous;
				held.set(key, release);
				snapshot ??= rows.map((row) => ({ ...row }));
			});
			try {
				const result = await work(scoped as unknown as DatabaseClient);
				events.push(`${id}:commit`);
				return result;
			} catch (error) {
				if (snapshot) rows = snapshot;
				events.push(`${id}:rollback`);
				throw error;
			} finally {
				for (const release of held.values()) release();
			}
		},
	);
	const root = { ...client(0), $transaction: transaction };
	const service = new ListsService(
		new ListsRepository(root as unknown as DatabaseClient),
	);
	return {
		service,
		board,
		failures,
		events,
		transaction,
		rows: () => rows.map((row) => ({ ...row })),
		root,
	};
}

describe('ListsService ordering', () => {
	it('starts an empty board at 1 and appends after active siblings only', async () => {
		const empty = setup();
		await expect(empty.service.createList('First', 'board')).resolves.toMatchObject({
			name: 'First',
			position: 1,
		});
		const { service } = setup([
			list('a', 3),
			list('archived', 100, { status: 'ARCHIVED', deletedAt: now }),
			list('deleted', 200, { deletedAt: now }),
			list('foreign', 300, { boardId: 'other' }),
		]);
		await expect(service.createList('New', 'board')).resolves.toMatchObject({
			position: 4,
		});
	});

	it.each([
		['append without neighbors', undefined, undefined, 4],
		['middle with both neighbors', 'a', 'b', 1.5],
		['middle with previous only', 'a', undefined, 1.5],
		['middle with next only', undefined, 'b', 1.5],
		['first', undefined, 'a', 0.5],
		['last', 'c', undefined, 4],
	] as const)('moves to %s', async (_name, before, after, position) => {
		const { service, rows } = setup([
			list('a', 1),
			list('moved', 1.25),
			list('b', 2),
			list('c', 3),
		]);
		await expect(service.moveList('moved', before, after)).resolves.toMatchObject({
			id: 'moved',
			position,
		});
		expect(
			rows()
				.filter((row) => row.id !== 'moved')
				.map((row) => row.position),
		).toEqual([1, 2, 3]);
	});

	it('excludes the moved list when checking neighbor adjacency', async () => {
		const { service } = setup([list('a', 1), list('moved', 2), list('b', 3)]);
		await expect(service.moveList('moved', 'a', 'b')).resolves.toMatchObject({
			position: 2,
		});
	});

	it.each([
		['self before', 'moved', undefined],
		['self after', undefined, 'moved'],
		['same neighbor', 'a', 'a'],
		['missing', 'missing', undefined],
		['foreign board', 'foreign', undefined],
		['archived', undefined, 'archived'],
		['deleted active', 'deleted', undefined],
		['reversed', 'b', 'a'],
		['nonadjacent', 'a', 'c'],
	] as const)('rejects %s without changing positions', async (_name, before, after) => {
		const initial = [
			list('a', 1),
			list('b', 2),
			list('c', 3),
			list('moved', 4),
			list('foreign', 5, { boardId: 'other' }),
			list('archived', 6, { status: 'ARCHIVED' }),
			list('deleted', 7, { deletedAt: now }),
		];
		const { service, rows } = setup(initial);
		await expect(service.moveList('moved', before, after)).rejects.toMatchObject({
			status: 422,
		});
		expect(rows()).toEqual(initial);
	});

	it.each([
		['equal positions', 5, 5],
		['adjacent floating point values', 1, 1 + Number.EPSILON],
		['midpoint overflow', -Number.MAX_VALUE, Number.MAX_VALUE],
	] as const)('rebalances %s in deterministic id order', async (_name, a, b) => {
		const { service, rows } = setup([
			list('b', b),
			list('a', a),
			list('moved', 20),
			list('archived', 70, { status: 'ARCHIVED' }),
		]);
		await expect(service.moveList('moved', 'a', 'b')).resolves.toMatchObject({
			position: 1.5,
		});
		expect(rows().find((row) => row.id === 'a')?.position).toBe(1);
		expect(rows().find((row) => row.id === 'b')?.position).toBe(2);
		expect(rows().find((row) => row.id === 'archived')?.position).toBe(70);
	});

	it.each([0, -10])(
		'inserts strictly before a nonpositive first position %s',
		async (first) => {
			const { service } = setup([list('a', first), list('moved', 20)]);
			await expect(
				service.moveList('moved', undefined, 'a'),
			).resolves.toMatchObject({ position: first - 1 });
		},
	);

	it.each([2 ** 53, Number.POSITIVE_INFINITY])(
		'rebalances an append without a finite increasing position (%s)',
		async (last) => {
			const { service, rows } = setup([list('a', last)]);
			await expect(service.createList('Next', 'board')).resolves.toMatchObject({
				position: 2,
			});
			expect(rows().find((row) => row.id === 'a')?.position).toBe(1);
		},
	);

	it('keeps a representable append beyond MAX_SAFE_INTEGER without unnecessary rebalance', async () => {
		const { service, rows } = setup([list('a', Number.MAX_SAFE_INTEGER)]);
		await expect(service.createList('Next', 'board')).resolves.toMatchObject({
			position: Number.MAX_SAFE_INTEGER + 1,
		});
		expect(rows().find((row) => row.id === 'a')?.position).toBe(
			Number.MAX_SAFE_INTEGER,
		);
	});

	it('rolls back earlier rebalance writes when a later position update fails', async () => {
		const initial = [list('a', 2 ** 53), list('b', 2 ** 53), list('moved', 30)];
		const { service, rows, failures, events } = setup(initial);
		failures.positionId = 'b';
		await expect(service.moveList('moved', 'a', 'b')).rejects.toThrow(
			'position write failed',
		);
		expect(events).toContain('1:write:a');
		expect(events).toContain('1:rollback');
		expect(rows()).toEqual(initial);
	});

	it('rolls back a successful rebalance when creating the new list fails', async () => {
		const initial = [list('a', 2 ** 53)];
		const { service, rows, failures, events } = setup(initial);
		failures.create = true;
		await expect(service.createList('New', 'board')).rejects.toThrow('create failed');
		expect(events).toContain('1:write:a');
		expect(rows()).toEqual(initial);
	});

	it('serializes concurrent create requests through the explicit parent locks', async () => {
		const { service, rows, events } = setup([list('a', 1)]);
		await Promise.all([
			service.createList('First', 'board'),
			service.createList('Second', 'board'),
		]);
		expect(rows().map((row) => row.position)).toEqual([1, 2, 3]);
		expect(events.indexOf('2:lock:Projects:project')).toBeGreaterThan(
			events.indexOf('1:commit'),
		);
	});

	it('serializes concurrent append moves and excludes each moved list from its own sibling set', async () => {
		const { service, rows, events } = setup([
			list('a', 1),
			list('b', 2),
			list('c', 3),
		]);
		await Promise.all([service.moveList('a'), service.moveList('b')]);
		expect(rows().map(({ id, position }) => [id, position])).toEqual([
			['a', 4],
			['b', 5],
			['c', 3],
		]);
		expect(events.indexOf('2:lock:Projects:project')).toBeGreaterThan(
			events.indexOf('1:commit'),
		);
	});
});

describe('ListsService lifecycle', () => {
	it('keeps archived lists readable and preserves optional status filtering', async () => {
		const archived = list('archived', 2, { status: 'ARCHIVED', deletedAt: now });
		const { service, board, transaction } = setup([list('a', 1), archived]);
		board.current!.status = 'ARCHIVED';
		board.current!.project.status = 'ARCHIVED';
		await expect(service.getAllListsByBoardId('board')).resolves.toHaveLength(2);
		await expect(service.getAllListsByBoardId('board', 'ARCHIVED')).resolves.toEqual([
			archived,
		]);
		expect(transaction).not.toHaveBeenCalled();
	});

	it('reports missing boards and lists as 404', async () => {
		const { service, board } = setup();
		board.current = null;
		await expect(service.getAllListsByBoardId('board')).rejects.toMatchObject({
			status: 404,
		});
		await expect(service.createList('New', 'board')).rejects.toMatchObject({
			status: 404,
		});
		await expect(service.updateListName('New', 'missing')).rejects.toMatchObject({
			status: 404,
		});
	});

	it.each([
		'project-status',
		'project-deleted',
		'board-status',
		'board-deleted',
	] as const)('blocks creation under %s', async (condition) => {
		const { service, board, rows } = setup();
		if (condition === 'project-status') board.current!.project.status = 'ARCHIVED';
		if (condition === 'project-deleted') board.current!.project.deletedAt = now;
		if (condition === 'board-status') board.current!.status = 'ARCHIVED';
		if (condition === 'board-deleted') board.current!.deletedAt = now;
		await expect(service.createList('New', 'board')).rejects.toMatchObject({
			status: 409,
		});
		expect(rows()).toEqual([]);
	});

	it.each(['rename', 'move', 'archive'] as const)(
		'blocks %s of an archived list',
		async (operation) => {
			const initial = [list('archived', 1, { status: 'ARCHIVED', deletedAt: now })];
			const { service, rows } = setup(initial);
			const action =
				operation === 'rename'
					? service.updateListName('New', 'archived')
					: operation === 'move'
						? service.moveList('archived')
						: service.archiveList('archived');
			await expect(action).rejects.toMatchObject({ status: 409 });
			expect(rows()).toEqual(initial);
		},
	);

	it('checks lifecycle after acquiring Project, Board and List locks', async () => {
		const { service, events } = setup([list('a', 1)]);
		await service.updateListName('Renamed', 'a');
		const listLock = events.indexOf('1:lock:Lists:a');
		expect(events.indexOf('1:lock:Projects:project')).toBeLessThan(
			events.indexOf('1:lock:Boards:board'),
		);
		expect(events.indexOf('1:lock:Boards:board')).toBeLessThan(listLock);
		expect(events.lastIndexOf('1:read-list')).toBeGreaterThan(listLock);
		expect(events.lastIndexOf('1:read-board')).toBeGreaterThan(listLock);
		expect(events.indexOf('1:write:a')).toBeGreaterThan(
			events.lastIndexOf('1:read-board'),
		);
	});

	it('rejects a mutation after a concurrent archive wins the project lock', async () => {
		const { service, board, transaction, rows } = setup([list('a', 1)]);
		let release!: () => void;
		let acquired!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const locked = new Promise<void>((resolve) => {
			acquired = resolve;
		});
		const archiving = transaction(async (client) => {
			await client.$queryRaw`SELECT id FROM "Projects" WHERE id = ${'project'} FOR UPDATE`;
			acquired();
			await waiting;
			board.current!.project.status = 'ARCHIVED';
		});
		await locked;
		const rename = expect(
			service.updateListName('Changed', 'a'),
		).rejects.toMatchObject({ status: 409 });
		release();
		await archiving;
		await rename;
		expect(rows()[0].name).toBe('a');
	});

	it('avoids touching updatedAt when a rename leaves the name unchanged', async () => {
		const { service, events } = setup([list('a', 1)]);
		await expect(service.updateListName('a', 'a')).resolves.toMatchObject({
			name: 'a',
		});
		expect(events).not.toContain('1:write:a');
	});

	it('archives only the list and restores its own status without changing ordering', async () => {
		const { service, rows } = setup([list('a', 1), list('b', 2)]);
		await expect(service.archiveList('a')).resolves.toMatchObject({
			status: 'ARCHIVED',
			deletedAt: expect.any(Date),
			position: 1,
		});
		await expect(service.restoreList('a')).resolves.toMatchObject({
			status: 'ACTIVE',
			deletedAt: null,
			position: 1,
		});
		expect(rows().find((row) => row.id === 'b')).toEqual(list('b', 2));
	});

	it.each(['project', 'board'] as const)(
		'requires an active %s to restore an archived list',
		async (parent) => {
			const { service, board, rows } = setup([
				list('a', 1, { status: 'ARCHIVED', deletedAt: now }),
			]);
			if (parent === 'board') board.current!.status = 'ARCHIVED';
			else board.current!.project.status = 'ARCHIVED';
			await expect(service.restoreList('a')).rejects.toMatchObject({ status: 409 });
			expect(rows()[0].status).toBe('ARCHIVED');
		},
	);

	it('rejects restoring a list that is already active', async () => {
		const { service } = setup([list('a', 1)]);
		await expect(service.restoreList('a')).rejects.toMatchObject({ status: 400 });
	});

	it('allows deleting an archived list under archived ancestors', async () => {
		const { service, board, rows, events } = setup([
			list('a', 1, { status: 'ARCHIVED', deletedAt: now }),
		]);
		board.current!.status = 'ARCHIVED';
		board.current!.project.status = 'ARCHIVED';
		await expect(service.deleteList('a')).resolves.toBeUndefined();
		expect(rows()).toEqual([]);
		expect(events).toContain('1:lock:Lists:a');
		expect(events).toContain('1:commit');
	});
});
