import { LabelsService } from '@/modules/labels/labels.service';
import { LabelsRepository } from '@/modules/labels/labels.repository';
import type { LabelRecord } from '@/modules/labels/labels.types';
import type { DatabaseClient } from '@/modules/database';
import type { CardActivityRecord } from '@/modules/cardActivities/cardActivities.types';

function fixture() {
	let activities: Pick<
		CardActivityRecord,
		'cardId' | 'userId' | 'action' | 'metadata'
	>[] = [];
	let labels: LabelRecord[] = [
		{
			id: 'label',
			name: 'Ready',
			color: 'red',
			boardId: 'board',
			createdAt: new Date(),
		},
	];
	let relations = [
		{ labelId: 'label', cardId: 'card' },
		{ labelId: 'other', cardId: 'card' },
	];
	const board = {
		projectId: 'project',
		status: 'ACTIVE',
		deletedAt: null as Date | null,
		project: { status: 'ACTIVE', deletedAt: null as Date | null },
	};
	const failures = { code: '', delete: false, activity: false };
	const events: string[] = [];
	const read = {
		boards: { findUnique: jest.fn(async () => board) },
		labels: { findMany: jest.fn(async () => labels) },
	};
	const root = {
		...read,
		$transaction: jest.fn(
			async (work: (client: DatabaseClient) => Promise<unknown>) => {
				let draft = labels.map((row) => ({ ...row }));
				let links = [...relations];
				const history = [...activities];
				let locked = false;
				const write = () => {
					if (!locked) throw new Error('Write without parent lock');
					if (failures.code)
						throw Object.assign(new Error('DB failure'), {
							code: failures.code,
						});
				};
				const scoped = {
					cardActivity: {
						create: jest.fn(
							async ({ data }: { data: (typeof activities)[number] }) => {
								write();
								if (failures.activity) throw new Error('Activity failed');
								history.push(data);
							},
						),
					},
					boards: read.boards,
					$queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
						events.push(
							parts.join('?').includes('"Projects"')
								? 'project-lock'
								: 'board-lock',
						);
						locked = true;
						return [];
					}),
					labels: {
						findUnique: jest.fn(
							async ({ where }: { where: { id: string } }) =>
								draft.find((row) => row.id === where.id) ?? null,
						),
						create: jest.fn(
							async ({
								data,
							}: {
								data: Omit<LabelRecord, 'id' | 'createdAt'>;
							}) => {
								write();
								const row = { ...data, id: 'new', createdAt: new Date() };
								draft.push(row);
								return row;
							},
						),
						update: jest.fn(
							async ({
								where,
								data,
							}: {
								where: { id: string };
								data: Partial<LabelRecord>;
							}) => {
								write();
								const row = draft.find((item) => item.id === where.id)!;
								Object.assign(row, data);
								return row;
							},
						),
						delete: jest.fn(async ({ where }: { where: { id: string } }) => {
							write();
							if (failures.delete) throw new Error('Delete failed');
							const row = draft.find((item) => item.id === where.id)!;
							draft = draft.filter((item) => item.id !== where.id);
							return row;
						}),
					},
					cardLabels: {
						findMany: jest.fn(
							async ({ where }: { where: { labelId: string } }) =>
								links
									.filter((row) => row.labelId === where.labelId)
									.map(({ cardId }) => ({ cardId })),
						),
						deleteMany: jest.fn(
							async ({ where }: { where: { labelId: string } }) => {
								write();
								links = links.filter(
									(row) => row.labelId !== where.labelId,
								);
								return { count: 1 };
							},
						),
					},
				} as unknown as DatabaseClient;
				const result = await work(scoped);
				labels = draft;
				relations = links;
				activities = history;
				events.push('commit');
				return result;
			},
		),
	};
	return {
		service: new LabelsService(
			new LabelsRepository(root as unknown as DatabaseClient),
		),
		board,
		failures,
		events,
		rows: () => labels,
		relations: () => relations,
		activities: () => activities,
	};
}

describe('LabelsService', () => {
	it('records changes on attached cards, including label deletion, and omits no-op edits', async () => {
		const f = fixture();
		await f.service.updateLabel('label', { name: 'Ready', color: 'red' }, 'actor');
		expect(f.activities()).toEqual([]);
		await f.service.updateLabel('label', { name: 'Done' }, 'actor');
		await f.service.deleteLabel('label', 'actor');
		expect(f.activities()).toEqual([
			{
				cardId: 'card',
				userId: 'actor',
				action: 'label_updated',
				metadata: { labelId: 'label', changedFields: ['name'] },
			},
			{
				cardId: 'card',
				userId: 'actor',
				action: 'label_removed',
				metadata: { labelId: 'label', reason: 'label_deleted' },
			},
		]);
	});
	it.each(['update', 'delete'])(
		'rolls label %s and its relations back if activity fails',
		async (action) => {
			const f = fixture();
			f.failures.activity = true;
			await expect(
				action === 'update'
					? f.service.updateLabel('label', { name: 'Done' }, 'actor')
					: f.service.deleteLabel('label', 'actor'),
			).rejects.toThrow('Activity failed');
			expect(f.rows()[0].name).toBe('Ready');
			expect(f.relations()).toHaveLength(2);
			expect(f.activities()).toEqual([]);
		},
	);
	it.each([{ name: 'Done' }, { color: 'blue' }])(
		'patches only the provided fields: %j',
		async (input) => {
			const f = fixture();
			await expect(
				f.service.updateLabel('label', input, 'actor'),
			).resolves.toMatchObject({
				name: 'Ready',
				color: 'red',
				...input,
			});
			expect(f.events).toEqual(['project-lock', 'board-lock', 'commit']);
		},
	);
	it('whitelists fields and rejects an empty patch', async () => {
		const f = fixture();
		await f.service.updateLabel(
			'label',
			{ name: 'Done', boardId: 'foreign' } as {
				name: string;
			},
			'actor',
		);
		expect(f.rows()[0].boardId).toBe('board');
		await expect(f.service.updateLabel('label', {}, 'actor')).rejects.toMatchObject({
			status: 422,
		});
	});
	it.each(['create', 'update'])(
		'maps the board/name unique constraint to a conflict on %s',
		async (action) => {
			const f = fixture();
			f.failures.code = 'P2002';
			await expect(
				action === 'create'
					? f.service.createLabel('Ready', 'blue', 'board')
					: f.service.updateLabel('label', { color: 'blue' }, 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(f.rows()).toHaveLength(1);
		},
	);
	it('propagates unexpected database errors', async () => {
		const f = fixture();
		f.failures.code = 'P1001';
		await expect(
			f.service.createLabel('Ready', 'red', 'board'),
		).rejects.toMatchObject({ code: 'P1001' });
	});
	it.each(['board', 'project'])(
		'blocks writes under an archived %s but retains read and explicit delete',
		async (target) => {
			const f = fixture();
			if (target === 'board') f.board.status = 'ARCHIVED';
			else f.board.project.status = 'ARCHIVED';
			await expect(
				f.service.createLabel('New', 'red', 'board'),
			).rejects.toMatchObject({ status: 409 });
			await expect(
				f.service.updateLabel('label', { name: 'New' }, 'actor'),
			).rejects.toMatchObject({ status: 409 });
			await expect(f.service.getLabelsByBoardId('board')).resolves.toHaveLength(1);
			await f.service.deleteLabel('label', 'actor');
			expect(f.rows()).toEqual([]);
			expect(f.relations()).toEqual([{ labelId: 'other', cardId: 'card' }]);
		},
	);
	it('rolls back relation deletion when label deletion fails', async () => {
		const f = fixture();
		f.failures.delete = true;
		await expect(f.service.deleteLabel('label', 'actor')).rejects.toThrow(
			'Delete failed',
		);
		expect(f.rows()).toHaveLength(1);
		expect(f.relations()).toHaveLength(2);
	});
	it('returns missing-label errors before mutation', async () => {
		const f = fixture();
		await expect(
			f.service.updateLabel('missing', { name: 'New' }, 'actor'),
		).rejects.toMatchObject({ status: 404 });
		await expect(f.service.deleteLabel('missing', 'actor')).rejects.toMatchObject({
			status: 404,
		});
		expect(f.events).toEqual([]);
	});
});
