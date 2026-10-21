import { contentFixture } from './content.fixture';
import { CommentsRepository } from '@/modules/comments/comments.repository';

describe('Checklists and checklist items', () => {
	it('creates checklist/items under the card transaction and preserves completed:false on partial PATCH', async () => {
		const f = contentFixture();
		await expect(f.checklists.createChecklist('card', 'New')).resolves.toMatchObject({
			title: 'New',
			cardId: 'card',
		});
		await f.items.createChecklistItem('checklist', 'New item');
		await expect(
			f.items.updateChecklistItem('item', undefined, false),
		).resolves.toMatchObject({ title: 'Task', completed: false });
		await expect(
			f.items.updateChecklistItem('item', 'Renamed'),
		).resolves.toMatchObject({ title: 'Renamed', completed: false });
		await expect(f.items.updateChecklistItem('item')).rejects.toMatchObject({
			status: 422,
		});
		expect(f.events.indexOf('1:lock:Cards')).toBeLessThan(
			f.events.indexOf('checklist:create'),
		);
	});
	it('deletes a checklist and its items exactly once, preserving other checklists', async () => {
		const f = contentFixture();
		f.state().card.status = 'ARCHIVED';
		f.board.status = 'ARCHIVED';
		await f.checklists.deleteChecklist('checklist');
		expect(f.state().checklists.map((row) => row.id)).toEqual(['other']);
		expect(f.state().items.map((row) => row.id)).toEqual(['other-item']);
		expect(f.events.filter((event) => event === 'items:delete')).toHaveLength(1);
		expect(f.root.$transaction).toHaveBeenCalledTimes(1);
	});
	it.each(['checklistDelete', 'commit'] as const)(
		'rolls back checklist and item deletion on %s failure',
		async (failure) => {
			const f = contentFixture();
			f.failures[failure] = true;
			await expect(f.checklists.deleteChecklist('checklist')).rejects.toThrow();
			expect(f.state().checklists).toHaveLength(2);
			expect(f.state().items).toHaveLength(2);
		},
	);
	it.each(['card', 'list', 'board', 'project'])(
		'rejects content writes when %s is archived before the parent lock',
		async (target) => {
			const f = contentFixture();
			f.beforeLock(() => {
				if (target === 'card') f.state().card.status = 'ARCHIVED';
				if (target === 'list') f.list.status = 'ARCHIVED';
				if (target === 'board') f.board.status = 'ARCHIVED';
				if (target === 'project') f.board.project.status = 'ARCHIVED';
			});
			await expect(
				f.items.updateChecklistItem('item', 'Changed'),
			).rejects.toMatchObject({ status: 409 });
			expect(f.state().items[0].title).toBe('Task');
		},
	);
	it('deletes only the selected item and reports missing resources', async () => {
		const f = contentFixture();
		await f.items.deleteChecklistItem('item');
		expect(f.state().items.map((row) => row.id)).toEqual(['other-item']);
		await expect(f.items.deleteChecklistItem('item')).rejects.toMatchObject({
			status: 404,
		});
		await expect(
			f.checklists.updateChecklistTitle('missing', 'Title'),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('Comments', () => {
	it.each(['create', 'update'] as const)(
		'commits %s and private notifications before socket delivery',
		async (action) => {
			const f = contentFixture();
			f.socket.emitNewNotification.mockImplementation(() => {
				expect(f.events).toContain('commit');
				expect(
					f.state().comments.find((row) => row.content === 'After'),
				).toBeDefined();
			});
			const row =
				action === 'create'
					? await f.comments.createComment({
							cardId: 'card',
							userId: 'actor',
							content: 'After',
						})
					: await f.comments.updateComment({
							commentId: 'comment',
							userId: 'actor',
							content: 'After',
						});
			expect(row).toMatchObject({ content: 'After', user: { name: 'Author' } });
			expect(f.state().notifications.map((record) => record.userId)).toEqual([
				'recipient',
			]);
			expect(f.root.$transaction).toHaveBeenCalledTimes(1);
			expect(f.events.indexOf('1:lock:Cards')).toBeLessThan(
				f.events.indexOf('comment:' + action),
			);
		},
	);
	it.each(['notification', 'commit'] as const)(
		'rolls back comment and notifications when %s fails',
		async (failure) => {
			const f = contentFixture();
			f.failures[failure] = true;
			await expect(
				f.comments.updateComment({
					commentId: 'comment',
					userId: 'actor',
					content: 'After',
				}),
			).rejects.toThrow();
			expect(f.state().comments[0].content).toBe('Before');
			expect(f.state().notifications).toEqual([]);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		},
	);
	it('requires both authorship and current board permission, including legacy viewer grants', async () => {
		const f = contentFixture();
		await expect(
			f.comments.updateComment({
				commentId: 'comment',
				userId: 'other',
				content: 'After',
			}),
		).rejects.toMatchObject({ status: 403 });
		f.access.allowed = false;
		await expect(
			f.comments.updateComment({
				commentId: 'comment',
				userId: 'actor',
				content: 'After',
			}),
		).rejects.toMatchObject({ status: 403 });
		f.access.allowed = true;
		f.access.role = 'BOARD_VIEWER';
		await expect(
			f.comments.updateComment({
				commentId: 'comment',
				userId: 'actor',
				content: 'After',
			}),
		).rejects.toMatchObject({ status: 403 });
		expect(f.state().comments[0].content).toBe('Before');
	});
	it('rechecks card lifecycle after locking and preserves the saved mutation if socket fails', async () => {
		const f = contentFixture();
		f.beforeLock(() => {
			f.state().card.status = 'ARCHIVED';
		});
		await expect(
			f.comments.createComment({
				cardId: 'card',
				userId: 'actor',
				content: 'After',
			}),
		).rejects.toMatchObject({ status: 409 });
		f.state().card.status = 'ACTIVE';
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		f.socket.emitNewNotification.mockImplementation(() => {
			throw new Error('socket closed');
		});
		await expect(
			f.comments.createComment({
				cardId: 'card',
				userId: 'actor',
				content: 'After',
			}),
		).resolves.toMatchObject({ content: 'After' });
		expect(f.state().comments).toHaveLength(2);
	});
	it('does not notify the actor and reads archived cards using only public user fields', async () => {
		const f = contentFixture();
		f.recipients.splice(1);
		await f.comments.updateComment({
			commentId: 'comment',
			userId: 'actor',
			content: 'After',
		});
		expect(f.state().notifications).toEqual([]);
		f.state().card.status = 'ARCHIVED';
		await expect(
			f.comments.getCommentsByCardId({ cardId: 'card' }),
		).resolves.toHaveLength(1);
		const repository = new CommentsRepository(f.client);
		await repository.getCommentsByCardId({ cardId: 'card' });
		expect(f.root.cardComments.findMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				include: {
					user: { select: { id: true, name: true, email: true, avatar: true } },
				},
			}),
		);
	});
});
