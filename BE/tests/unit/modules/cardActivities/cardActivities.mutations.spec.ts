import { cardFixture, makeCard, now } from '../cards/cards.fixture';
import { contentFixture } from '../content/content.fixture';

type CardFixture = ReturnType<typeof cardFixture>;
const cardCases: {
	action: string;
	setup?: (f: CardFixture) => void;
	run: (f: CardFixture) => Promise<unknown>;
}[] = [
	{ action: 'created', run: (f) => f.service.createCard('New card', 'list', 'actor') },
	{ action: 'moved', run: (f) => f.service.moveCard('card', 'target', 'actor') },
	{ action: 'archived', run: (f) => f.service.archiveCard('card', 'actor') },
	{
		action: 'restored',
		setup: (f) => {
			f.state().cards[0].status = 'ARCHIVED';
			f.state().cards[0].deletedAt = now;
		},
		run: (f) => f.service.restoreCard('card', 'actor'),
	},
	{
		action: 'label_added',
		run: (f) => f.service.addLabelToCard('card', 'label', 'actor'),
	},
	{
		action: 'label_removed',
		setup: (f) => {
			f.state().relations.push({
				id: 'relation',
				cardId: 'card',
				labelId: 'label',
			});
		},
		run: (f) => f.service.removeLabelFromCard('card', 'label', 'actor'),
	},
	{
		action: 'member_added',
		run: (f) => f.service.addMemberToCard('card', 'assignee', 'actor'),
	},
	{
		action: 'member_removed',
		setup: (f) => {
			f.state().assignments.push({
				id: 'assignment',
				cardId: 'card',
				userId: 'assignee',
			});
		},
		run: (f) => f.service.removeMemberFromCard('card', 'assignee', 'actor'),
	},
];
describe('Card mutation activity coverage', () => {
	it.each(cardCases)(
		'commits exactly one $action activity with its mutation',
		async ({ action, setup, run }) => {
			const f = cardFixture();
			setup?.(f);
			await run(f);
			expect(f.state().activities).toHaveLength(1);
			expect(f.state().activities[0]).toMatchObject({
				action,
				userId: 'actor',
				details: null,
			});
			expect(f.state().activities[0].metadata).not.toBeNull();
			expect(f.events.indexOf('1:activity')).toBeLessThan(
				f.events.indexOf('1:commit'),
			);
		},
	);
	it.each(cardCases)(
		'rolls back the $action mutation when writing its activity fails',
		async ({ setup, run }) => {
			const f = cardFixture();
			setup?.(f);
			const snapshot = JSON.stringify(f.state());
			f.failures.activity = true;
			await expect(run(f)).rejects.toThrow('Activity write failed');
			expect(JSON.stringify(f.state())).toBe(snapshot);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		},
	);
	it('does not update positions or record fake activity for a move to the same slot or an absent label removal', async () => {
		const f = cardFixture([makeCard('first', 1), makeCard('card', 100)]);
		await expect(f.service.moveCard('card', 'list', 'actor')).resolves.toMatchObject({
			position: 100,
			updatedAt: now,
		});
		await f.service.removeLabelFromCard('card', 'label', 'actor');
		expect(f.state().activities).toEqual([]);
		expect(f.events.some((event) => event.includes(':card-write:'))).toBe(false);
	});
	it('keeps assignment/notification/activity atomic and suppresses delivery on notification failure', async () => {
		const f = cardFixture();
		f.failures.notification = true;
		await expect(
			f.service.addMemberToCard('card', 'assignee', 'actor'),
		).rejects.toThrow();
		expect(f.state().activities).toEqual([]);
		expect(f.state().assignments).toEqual([]);
		expect(f.state().notifications).toEqual([]);
		expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
	});
	it('deletes history with the card while preserving other card history', async () => {
		const f = cardFixture([makeCard('card'), makeCard('other')]);
		await f.service.archiveCard('card', 'actor');
		await f.service.archiveCard('other', 'actor');
		await f.service.deleteCard('card', 'actor');
		expect(f.state().activities).toMatchObject([
			{ cardId: 'other', action: 'archived' },
		]);
	});
});

type ContentFixture = ReturnType<typeof contentFixture>;
const contentCases: { action: string; run: (f: ContentFixture) => Promise<unknown> }[] = [
	{
		action: 'checklist_created',
		run: (f) => f.checklists.createChecklist('card', 'Long private title', 'actor'),
	},
	{
		action: 'checklist_updated',
		run: (f) =>
			f.checklists.updateChecklistTitle('checklist', 'Long private title', 'actor'),
	},
	{
		action: 'checklist_deleted',
		run: (f) => f.checklists.deleteChecklist('checklist', 'actor'),
	},
	{
		action: 'checklist_item_created',
		run: (f) =>
			f.items.createChecklistItem('checklist', 'Long private title', 'actor'),
	},
	{
		action: 'checklist_item_updated',
		run: (f) =>
			f.items.updateChecklistItem('item', 'actor', 'Long private title', false),
	},
	{
		action: 'checklist_item_deleted',
		run: (f) => f.items.deleteChecklistItem('item', 'actor'),
	},
	{
		action: 'comment_created',
		run: (f) =>
			f.comments.createComment({
				cardId: 'card',
				userId: 'actor',
				content: 'Long private title',
			}),
	},
	{
		action: 'comment_updated',
		run: (f) =>
			f.comments.updateComment({
				commentId: 'comment',
				userId: 'actor',
				content: 'Long private title',
			}),
	},
];
describe('Content mutation activity coverage', () => {
	it.each(contentCases)(
		'commits one $action activity with identifiers, without copying content',
		async ({ action, run }) => {
			const f = contentFixture();
			await run(f);
			expect(f.state().activities).toHaveLength(1);
			expect(f.state().activities[0]).toMatchObject({
				action,
				cardId: 'card',
				userId: 'actor',
			});
			expect(JSON.stringify(f.state().activities[0].metadata)).not.toContain(
				'Long private title',
			);
			expect(f.events.indexOf('activity')).toBeLessThan(f.events.indexOf('commit'));
		},
	);
	it.each(contentCases)(
		'rolls back $action and notifications on activity persistence failure',
		async ({ run }) => {
			const f = contentFixture();
			const snapshot = JSON.stringify(f.state());
			f.failures.activity = true;
			await expect(run(f)).rejects.toThrow('Activity write failed');
			expect(JSON.stringify(f.state())).toBe(snapshot);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		},
	);
	it('retains completed:false in metadata while no-op content edits create no activity or notifications', async () => {
		const f = contentFixture();
		await f.items.updateChecklistItem('item', 'actor', undefined, false);
		expect(f.state().activities[0].metadata).toEqual({
			checklistId: 'checklist',
			itemId: 'item',
			changedFields: ['completed'],
			completed: { from: true, to: false },
		});
		await f.items.updateChecklistItem('item', 'actor', 'Task', false);
		await f.checklists.updateChecklistTitle('checklist', 'Tasks', 'actor');
		await f.comments.updateComment({
			commentId: 'comment',
			userId: 'actor',
			content: 'Before',
		});
		expect(f.state().activities).toHaveLength(1);
		expect(f.events.filter((event) => event === 'item:update')).toHaveLength(1);
		expect(f.state().notifications).toEqual([]);
	});
	it('rolls activity back on notification/commit errors and does not lose committed history on socket failure', async () => {
		for (const failure of ['notification', 'commit'] as const) {
			const f = contentFixture();
			f.failures[failure] = true;
			await expect(
				f.comments.createComment({
					cardId: 'card',
					userId: 'actor',
					content: 'After',
				}),
			).rejects.toThrow();
			expect(f.state().activities).toEqual([]);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		}
		const f = contentFixture();
		f.socket.emitNewNotification.mockImplementation(() => {
			throw new Error('socket down');
		});
		await expect(
			f.comments.createComment({
				cardId: 'card',
				userId: 'actor',
				content: 'After',
			}),
		).resolves.toMatchObject({ content: 'After' });
		expect(f.state().activities).toHaveLength(1);
	});
});
