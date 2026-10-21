import { cardFixture, makeCard, now } from './cards.fixture';

describe('Card ordering and lifecycle', () => {
	it('serializes a create and a move into the same destination', async () => {
		const f = cardFixture();
		const [created, moved] = await Promise.all([
			f.service.createCard('New', 'target', 'actor'),
			f.service.moveCard('card', 'target', 'actor'),
		]);
		expect([created.position, moved.position].sort((a, b) => a - b)).toEqual([1, 2]);
		expect(f.state().cards.every((row) => row.listId === 'target')).toBe(true);
	});

	it('serializes opposite moves within a board using the same parent lock order', async () => {
		const f = cardFixture([makeCard('a'), makeCard('b', 1, 'target')]);
		await Promise.all([
			f.service.moveCard('a', 'target', 'actor'),
			f.service.moveCard('b', 'list', 'actor'),
		]);
		expect(f.state().cards.map((row) => [row.id, row.listId, row.position])).toEqual([
			['a', 'target', 2],
			['b', 'list', 1],
		]);
		expect(f.events.indexOf('1:commit')).toBeLessThan(
			f.events.indexOf('2:lock:Projects'),
		);
	});
	it('appends concurrent creates after active siblings under the parent lock', async () => {
		const f = cardFixture([
			makeCard('first', 4),
			{ ...makeCard('archived', 99), status: 'ARCHIVED', deletedAt: now },
		]);
		const rows = await Promise.all([
			f.service.createCard('One', 'list', 'actor'),
			f.service.createCard('Two', 'list', 'actor'),
		]);
		expect(rows.map((row) => row.position)).toEqual([5, 6]);
		expect(f.events.slice(0, 3)).toEqual([
			'1:lock:Projects',
			'1:lock:Boards',
			'1:lock:Lists',
		]);
		expect(f.state().cards).toHaveLength(4);
	});

	it.each([
		[undefined, undefined, 4],
		['b', undefined, 2.5],
		[undefined, 'b', 1.5],
		['a', 'b', 1.5],
	])('moves using neighbors %s / %s', async (before, after, position) => {
		const f = cardFixture([
			makeCard('card'),
			makeCard('a', 1, 'target'),
			makeCard('b', 2, 'target'),
			makeCard('c', 3, 'target'),
		]);
		await expect(
			f.service.moveCard('card', 'target', 'actor', before, after),
		).resolves.toMatchObject({ listId: 'target', position });
		expect(f.events.indexOf('1:lock:Cards')).toBeLessThan(
			f.events.indexOf('1:card-write:card'),
		);
	});

	it.each([
		['card', undefined],
		[undefined, 'card'],
		['a', 'a'],
		['missing', undefined],
		['a', 'c'],
		['b', 'a'],
	])(
		'rejects self, missing, reversed or nonadjacent neighbors %s / %s',
		async (before, after) => {
			const f = cardFixture([
				makeCard('card'),
				makeCard('a', 1, 'target'),
				makeCard('b', 2, 'target'),
				makeCard('c', 3, 'target'),
			]);
			await expect(
				f.service.moveCard('card', 'target', 'actor', before, after),
			).rejects.toMatchObject({ status: 422 });
			expect(f.state().cards[0].listId).toBe('list');
		},
	);

	it.each(['other-list', 'archived-neighbor'])(
		'rejects a neighbor outside the active destination: %s',
		async (neighbor) => {
			const f = cardFixture([
				makeCard('card'),
				makeCard('other-list', 2),
				{
					...makeCard('archived-neighbor', 2, 'target'),
					status: 'ARCHIVED',
					deletedAt: now,
				},
			]);
			await expect(
				f.service.moveCard('card', 'target', 'actor', neighbor),
			).rejects.toMatchObject({ status: 422 });
		},
	);

	it('rejects cross-board moves without locking a second project', async () => {
		const f = cardFixture();
		await expect(
			f.service.moveCard('card', 'foreign', 'actor'),
		).rejects.toMatchObject({ status: 400 });
		expect(f.events.filter((event) => event.endsWith('lock:Projects'))).toHaveLength(
			1,
		);
	});

	it('rebalances equal positions deterministically and rolls all writes back on failure', async () => {
		const f = cardFixture([
			makeCard('card'),
			makeCard('b', 1, 'target'),
			makeCard('a', 1, 'target'),
		]);
		await expect(
			f.service.moveCard('card', 'target', 'actor', 'a', 'b'),
		).resolves.toMatchObject({ position: 1.5 });
		expect(f.state().cards.find((row) => row.id === 'b')?.position).toBe(2);
		const failed = cardFixture([
			makeCard('card'),
			makeCard('a', 1, 'target'),
			makeCard('b', 1, 'target'),
		]);
		failed.failures.updateCard = 'b';
		await expect(
			failed.service.moveCard('card', 'target', 'actor', 'a', 'b'),
		).rejects.toThrow('Card write failed');
		expect(failed.state().cards.map((row) => [row.listId, row.position])).toEqual([
			['list', 1],
			['target', 1],
			['target', 1],
		]);
	});

	it('rebalances positions when appending would overflow or lose precision', async () => {
		const f = cardFixture([makeCard('last', Number.MAX_VALUE)]);
		await expect(
			f.service.createCard('Next', 'list', 'actor'),
		).resolves.toMatchObject({ position: 2 });
		expect(f.state().cards[0].position).toBe(1);
	});

	it.each(['card', 'list', 'board', 'project'])(
		'blocks ordinary writes under an archived %s',
		async (target) => {
			const f = cardFixture();
			if (target === 'card') f.state().cards[0].status = 'ARCHIVED';
			if (target === 'list') f.state().lists[0].status = 'ARCHIVED';
			if (target === 'board') f.board.status = 'ARCHIVED';
			if (target === 'project') f.board.project.status = 'ARCHIVED';
			await expect(f.service.addLabelToCard('card', 'label')).rejects.toMatchObject(
				{ status: 409 },
			);
			expect(f.state().relations).toEqual([]);
		},
	);

	it('archives only the card; restore requires active ancestors', async () => {
		const f = cardFixture();
		await f.service.archiveCard('card', 'actor');
		expect(f.state().cards[0]).toMatchObject({
			status: 'ARCHIVED',
			deletedAt: expect.any(Date),
		});
		expect(f.state().lists[0].status).toBe('ACTIVE');
		f.state().lists[0].status = 'ARCHIVED';
		await expect(f.service.restoreCard('card')).rejects.toMatchObject({
			status: 409,
		});
		f.state().lists[0].status = 'ACTIVE';
		await expect(f.service.restoreCard('card')).resolves.toMatchObject({
			status: 'ACTIVE',
			deletedAt: null,
		});
		await expect(f.service.restoreCard('card')).rejects.toMatchObject({
			status: 400,
		});
	});

	it('deletes the entire archived subtree and preserves other cards and board labels', async () => {
		const f = cardFixture([
			{ ...makeCard('card'), status: 'ARCHIVED', deletedAt: now },
			makeCard('other'),
		]);
		f.board.status = 'ARCHIVED';
		f.state().assignments.push(
			{ id: 'a', cardId: 'card', userId: 'user' },
			{ id: 'b', cardId: 'other', userId: 'user' },
		);
		f.state().relations.push(
			{ id: 'c', cardId: 'card', labelId: 'label' },
			{ id: 'd', cardId: 'other', labelId: 'label' },
		);
		await expect(f.service.deleteCard('card', 'actor')).resolves.toMatchObject({
			id: 'card',
			status: 'ARCHIVED',
		});
		expect(f.state().cards.map((row) => row.id)).toEqual(['other']);
		for (const rows of Object.values(f.state().children))
			expect(rows).toEqual(['other']);
		expect(f.state().assignments.map((row) => row.cardId)).toEqual(['other']);
		expect(f.state().relations.map((row) => row.cardId)).toEqual(['other']);
		expect(f.labels).toHaveLength(2);
	});

	it.each(['checklists', 'cardAttachments', 'cardActivity'])(
		'rolls back the entire deletion on %s failure',
		async (table) => {
			const f = cardFixture();
			f.failures.deleteTable = table;
			await expect(f.service.deleteCard('card', 'actor')).rejects.toThrow(
				'Child deletion failed',
			);
			expect(f.state().cards).toHaveLength(1);
			for (const rows of Object.values(f.state().children))
				expect(rows).toEqual(['card', 'other']);
		},
	);

	it('returns controlled errors for missing card or destination', async () => {
		const f = cardFixture();
		await expect(f.service.archiveCard('missing', 'actor')).rejects.toMatchObject({
			status: 404,
		});
		await expect(
			f.service.moveCard('card', 'missing', 'actor'),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('Card labels and assignments', () => {
	it('attaches a label only from the same board and prevents duplicate concurrent attaches', async () => {
		const f = cardFixture();
		await expect(
			f.service.addLabelToCard('card', 'foreign-label'),
		).rejects.toMatchObject({ status: 422 });
		const results = await Promise.allSettled([
			f.service.addLabelToCard('card', 'label'),
			f.service.addLabelToCard('card', 'label'),
		]);
		expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
		expect(f.state().relations).toHaveLength(1);
	});

	it('removes label and assignment only from the specified card, even if membership was removed', async () => {
		const f = cardFixture([makeCard('card'), makeCard('other')]);
		f.state().relations.push(
			{ id: 'a', cardId: 'card', labelId: 'label' },
			{ id: 'b', cardId: 'other', labelId: 'label' },
		);
		f.state().assignments.push(
			{ id: 'c', cardId: 'card', userId: 'assignee' },
			{ id: 'd', cardId: 'other', userId: 'assignee' },
		);
		f.membership.exists = false;
		await f.service.removeLabelFromCard('card', 'label');
		await f.service.removeMemberFromCard('card', 'assignee');
		expect(f.state().relations.map((row) => row.cardId)).toEqual(['other']);
		expect(f.state().assignments.map((row) => row.cardId)).toEqual(['other']);
		await expect(
			f.service.removeMemberFromCard('card', 'assignee'),
		).rejects.toMatchObject({ status: 404 });
	});

	it.each(['BOARD_VIEWER', 'PROJECT_ADMIN', 'USER'])(
		'rejects assignee role %s',
		async (role) => {
			const f = cardFixture();
			f.role.name = role;
			await expect(
				f.service.addMemberToCard('card', 'assignee', 'actor'),
			).rejects.toMatchObject({ status: 403 });
			expect(f.state().assignments).toEqual([]);
		},
	);

	it.each(['inactive', 'deleted', 'nonmember', 'missing-actor'])(
		'rejects invalid assignment: %s',
		async (reason) => {
			const f = cardFixture();
			if (reason === 'inactive') f.role.status = 'INACTIVE';
			if (reason === 'deleted') f.role.deletedAt = now;
			if (reason === 'nonmember') f.membership.exists = false;
			if (reason === 'missing-actor') f.actor.exists = false;
			await expect(
				f.service.addMemberToCard('card', 'assignee', 'actor'),
			).rejects.toMatchObject({
				status: ['inactive', 'deleted'].includes(reason) ? 403 : 404,
			});
			expect(f.state().assignments).toEqual([]);
		},
	);

	it('commits assignment and notification once under concurrent requests, then delivers', async () => {
		const f = cardFixture();
		f.socket.emitNewNotification.mockImplementation(() => {
			expect(f.state().assignments).toHaveLength(1);
			expect(f.events).toContain('1:commit');
		});
		const results = await Promise.allSettled([
			f.service.addMemberToCard('card', 'assignee', 'actor'),
			f.service.addMemberToCard('card', 'assignee', 'actor'),
		]);
		expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
		expect(f.state().assignments).toHaveLength(1);
		expect(f.state().notifications).toHaveLength(1);
		expect(f.socket.emitNewNotification).toHaveBeenCalledTimes(1);
	});

	it.each(['notification', 'commit'])(
		'rolls back assignment and suppresses socket on %s failure',
		async (failure) => {
			const f = cardFixture();
			f.failures[failure as 'notification' | 'commit'] = true;
			await expect(
				f.service.addMemberToCard('card', 'assignee', 'actor'),
			).rejects.toThrow();
			expect(f.state().assignments).toEqual([]);
			expect(f.state().notifications).toEqual([]);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		},
	);

	it('keeps the successful assignment when socket delivery fails and skips self notifications', async () => {
		const f = cardFixture();
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		f.socket.emitNewNotification.mockImplementation(() => {
			throw new Error('Socket unavailable');
		});
		await expect(
			f.service.addMemberToCard('card', 'assignee', 'actor'),
		).resolves.toMatchObject({ cardId: 'card', userId: 'assignee' });
		expect(f.state().assignments).toHaveLength(1);
		await f.service.addMemberToCard('card', 'actor', 'actor');
		expect(f.state().assignments).toHaveLength(2);
		expect(f.state().notifications).toHaveLength(1);
	});
});
