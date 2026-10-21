import { updateCardRequestBody } from '@/modules/cards/dtos/requests/updateCard.request';
import { isCardOverdue, mapCard } from '@/modules/cards/card.mapper';
import { cardFixture, makeCard, now } from './cards.fixture';

describe('Card metadata input', () => {
	it.each([
		{},
		{ title: '' },
		{ title: '   ' },
		{ title: 'a'.repeat(101) },
		{ title: null },
		{ description: false },
		{ isComplete: 'false' },
		{ dueDate: '' },
		{ dueDate: '2026-10-21' },
		{ dueDate: '2026-10-21T17:00:00' },
		{ dueDate: '2026-02-30T17:00:00Z' },
		{ dueDate: '2026-10-21T25:00:00Z' },
		{ dueDate: '2026-10-21T17:00:00+25:00' },
		{ dueDate: 123 },
		{ members: [] },
		{ listId: 'list' },
		{ status: 'ARCHIVED' },
		{ background: 'red' },
		{ title: 'Valid', userId: 'other-actor' },
	])('rejects invalid or unrecognized metadata: %j', (body) => {
		expect(updateCardRequestBody.safeParse(body).success).toBe(false);
	});
	it('parses offsets into UTC and preserves null/false instead of dropping them', () => {
		const body = updateCardRequestBody.parse({
			dueDate: '2026-10-21T17:00:00+07:00',
			description: null,
			isComplete: false,
		});
		expect(body).toEqual({
			dueDate: new Date('2026-10-21T10:00:00Z'),
			description: null,
			isComplete: false,
		});
		expect(updateCardRequestBody.parse({ dueDate: null })).toEqual({ dueDate: null });
		expect(
			updateCardRequestBody.parse({ dueDate: '2020-01-01T00:00:00Z' }).dueDate,
		).toEqual(new Date('2020-01-01T00:00:00Z'));
	});
});

describe('Card metadata transaction', () => {
	it('updates only supplied fields and records one activity with its actor in the same transaction', async () => {
		const original = { ...makeCard('card'), description: 'Private long description' };
		const f = cardFixture([original]);
		const input = updateCardRequestBody.parse({
			title: 'Updated',
			description: null,
			dueDate: '2026-10-21T17:00:00+07:00',
			isComplete: true,
		});
		const updated = await f.service.updateCard('card', input, 'actor');
		expect(updated).toEqual({
			...original,
			...input,
			updatedAt: new Date(now.getTime() + 1),
		});
		expect(f.state().activities).toHaveLength(1);
		const activity = f.state().activities[0];
		expect(activity).toMatchObject({
			cardId: 'card',
			userId: 'actor',
			action: 'updated',
		});
		expect(activity.metadata).toEqual({
			changedFields: ['title', 'description', 'dueDate', 'isComplete'],
			title: { from: 'card', to: 'Updated' },
			dueDate: { from: null, to: '2026-10-21T10:00:00.000Z' },
			isComplete: { from: false, to: true },
		});
		expect(JSON.stringify(activity.metadata)).not.toContain(original.description);
		expect(f.events).toEqual([
			'1:lock:Projects',
			'1:lock:Boards',
			'1:lock:Lists',
			'1:lock:Cards',
			'1:card-write:card',
			'1:activity',
			'1:commit',
		]);
		expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
	});
	it('clears nullable fields and reopens a card without changing its list or lifecycle', async () => {
		const original = {
			...makeCard('card'),
			description: 'Description',
			dueDate: now,
			isComplete: true,
		};
		const f = cardFixture([original]);
		await expect(
			f.service.updateCard(
				'card',
				{ description: null, dueDate: null, isComplete: false },
				'actor',
			),
		).resolves.toMatchObject({
			description: null,
			dueDate: null,
			isComplete: false,
			listId: 'list',
			status: 'ACTIVE',
			deletedAt: null,
		});
		expect(f.state().activities[0].metadata).toMatchObject({
			dueDate: { from: now.toISOString(), to: null },
			isComplete: { from: true, to: false },
		});
	});
	it('keeps completion independent of a deadline, including clearing and changing it', async () => {
		const f = cardFixture();
		await expect(
			f.service.updateCard('card', { isComplete: true }, 'actor'),
		).resolves.toMatchObject({ dueDate: null, isComplete: true });
		await expect(
			f.service.updateCard(
				'card',
				{ dueDate: new Date('2020-01-01T00:00:00Z') },
				'actor',
			),
		).resolves.toMatchObject({ isComplete: true });
		await expect(
			f.service.updateCard('card', { dueDate: null }, 'actor'),
		).resolves.toMatchObject({ dueDate: null, isComplete: true });
	});
	it('keeps omitted fields and empty descriptions, and does not assign unrelated fields from an internal caller', async () => {
		const original = { ...makeCard('card'), dueDate: now, isComplete: true };
		const f = cardFixture([original]);
		const input = { description: '', listId: 'foreign', status: 'ARCHIVED' };
		await expect(f.service.updateCard('card', input, 'actor')).resolves.toEqual({
			...original,
			description: '',
			updatedAt: new Date(now.getTime() + 1),
		});
	});
	it('does not bump updatedAt or create activity for equivalent values or offset representations', async () => {
		const original = {
			...makeCard('card'),
			dueDate: new Date('2026-10-21T10:00:00Z'),
		};
		const f = cardFixture([original]);
		const input = updateCardRequestBody.parse({
			title: 'card',
			description: null,
			dueDate: '2026-10-21T17:00:00+07:00',
			isComplete: false,
		});
		await expect(f.service.updateCard('card', input, 'actor')).resolves.toEqual(
			original,
		);
		expect(f.state().cards).toEqual([original]);
		expect(f.state().activities).toEqual([]);
		expect(
			f.events.some(
				(event) => event.includes('card-write') || event.endsWith(':activity'),
			),
		).toBe(false);
	});
	it('includes only actual changes in activity when other supplied values are unchanged', async () => {
		const f = cardFixture();
		await f.service.updateCard(
			'card',
			{ title: 'card', dueDate: null, isComplete: true },
			'actor',
		);
		expect(f.state().activities[0].metadata).toEqual({
			changedFields: ['isComplete'],
			isComplete: { from: false, to: true },
		});
	});
	it.each(['updateCard', 'activity', 'commit'] as const)(
		'rolls back metadata and activity if %s fails',
		async (failure) => {
			const f = cardFixture();
			if (failure === 'updateCard') f.failures.updateCard = 'card';
			else f.failures[failure] = true;
			await expect(
				f.service.updateCard('card', { title: 'Updated' }, 'actor'),
			).rejects.toThrow();
			expect(f.state().cards).toEqual([makeCard('card')]);
			expect(f.state().activities).toEqual([]);
			expect(f.events).toContain('1:rollback');
		},
	);
	it.each(['card', 'list', 'board', 'project'] as const)(
		'rejects an archived %s under the lock',
		async (resource) => {
			const f = cardFixture();
			if (resource === 'card') f.state().cards[0].status = 'ARCHIVED';
			else if (resource === 'list') f.state().lists[0].status = 'ARCHIVED';
			else if (resource === 'board') f.board.status = 'ARCHIVED';
			else f.board.project.status = 'ARCHIVED';
			await expect(
				f.service.updateCard('card', { isComplete: true }, 'actor'),
			).rejects.toMatchObject({ status: 409 });
			expect(f.state().activities).toHaveLength(0);
			expect(f.events).not.toContain('1:card-write:card');
		},
	);
	it.each(['outsider', 'viewer'] as const)(
		'rechecks permission for an %s before even a no-op',
		async (actor) => {
			const f = cardFixture();
			if (actor === 'outsider') f.access.allowed = false;
			else f.access.role = 'BOARD_VIEWER';
			await expect(
				f.service.updateCard('card', { title: 'card' }, 'actor'),
			).rejects.toMatchObject({ status: 403 });
			expect(f.state().activities).toHaveLength(0);
		},
	);
	it.each(['systemAdmin', 'projectAllowed'] as const)(
		'keeps %s permission inheritance',
		async (grant) => {
			const f = cardFixture();
			f.access.allowed = false;
			f.access[grant] = true;
			await expect(
				f.service.updateCard('card', { isComplete: true }, 'actor'),
			).resolves.toMatchObject({ isComplete: true });
		},
	);
	it('rejects an empty internal input and returns 404 for a missing card', async () => {
		const f = cardFixture();
		await expect(f.service.updateCard('card', {}, 'actor')).rejects.toMatchObject({
			status: 422,
		});
		expect(f.root.$transaction).not.toHaveBeenCalled();
		await expect(
			f.service.updateCard('missing', { title: 'Changed' }, 'actor'),
		).rejects.toMatchObject({ status: 404 });
	});
	it.each([true, false])(
		'serializes a PATCH and move without overwriting either change (PATCH first: %s)',
		async (patchFirst) => {
			const f = cardFixture([makeCard('card'), makeCard('existing', 9, 'target')]);
			const patch = () =>
				f.service.updateCard(
					'card',
					{ title: 'Updated', isComplete: true },
					'actor',
				);
			const move = () => f.service.moveCard('card', 'target', 'actor');
			await Promise.all(patchFirst ? [patch(), move()] : [move(), patch()]);
			expect(f.state().cards[0]).toMatchObject({
				title: 'Updated',
				isComplete: true,
				listId: 'target',
				position: 10,
			});
			expect(
				f.state().activities.filter((row) => row.action === 'updated'),
			).toHaveLength(1);
			expect(
				f.state().activities.filter((row) => row.action === 'moved'),
			).toHaveLength(1);
			expect(f.events.indexOf('1:commit')).toBeLessThan(
				f.events.indexOf('2:lock:Projects'),
			);
		},
	);
	it('merges concurrent partial patches and records each committed change', async () => {
		const f = cardFixture();
		await Promise.all([
			f.service.updateCard('card', { title: 'Updated' }, 'actor'),
			f.service.updateCard('card', { isComplete: true }, 'actor'),
		]);
		expect(f.state().cards[0]).toMatchObject({ title: 'Updated', isComplete: true });
		expect(
			f
				.state()
				.activities.map(
					(row) => (row.metadata as { changedFields: string[] }).changedFields,
				),
		).toEqual([['title'], ['isComplete']]);
	});
	it('rejects a queued PATCH if archive committed first', async () => {
		const f = cardFixture();
		const results = await Promise.allSettled([
			f.service.archiveCard('card', 'actor'),
			f.service.updateCard('card', { isComplete: true }, 'actor'),
		]);
		expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
		expect(f.state().cards[0].isComplete).toBe(false);
		expect(f.state().activities.map((row) => row.action)).toEqual(['archived']);
	});
});

describe('Derived overdue state', () => {
	it.each([
		[null, false, false],
		[null, true, false],
		[new Date(now.getTime() - 1), false, true],
		[new Date(now.getTime() - 1), true, false],
		[now, false, false],
		[new Date(now.getTime() + 1), false, false],
	])('derives dueDate=%s / isComplete=%s as %s', (dueDate, isComplete, expected) => {
		expect(isCardOverdue({ dueDate, isComplete }, now.getTime())).toBe(expected);
	});
	it('recomputes GET basic/includes and list summaries at read time without persisting overdue', async () => {
		jest.useFakeTimers().setSystemTime(now);
		try {
			const card = { ...makeCard('card'), dueDate: new Date(now.getTime() + 1) };
			const f = cardFixture([card]);
			expect(mapCard(card).isOverdue).toBe(false);
			jest.setSystemTime(now.getTime() + 2);
			expect(mapCard(card, { members: true })).toMatchObject({
				isComplete: false,
				isOverdue: true,
			});
			const rows = await f.service.getAllCardsByListId('list', 'actor');
			expect(rows[0]).toMatchObject({
				dueDate: card.dueDate,
				isComplete: false,
				isOverdue: true,
			});
			expect(f.state().cards[0]).not.toHaveProperty('isOverdue');
			expect(f.root.$transaction).not.toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});
});
