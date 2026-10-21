import { CardReminderRepository } from '@/modules/cardReminders/card-reminder.repository';
import { CardReminderService } from '@/modules/cardReminders/card-reminder.service';
import { CardReminderWorker } from '@/modules/cardReminders/card-reminder.worker';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PermissionService } from '@/modules/permissions/permission.service';
import { updateCardRequestBody } from '@/modules/cards/dtos/requests/updateCard.request';
import { cardFixture, makeCard, now } from './cards.fixture';

const dueDate = new Date(now.getTime() + 3600000);
async function fixture() {
	const f = cardFixture([{ ...makeCard('card'), dueDate }]);
	f.state().assignments.push({ id: 'assignment', cardId: 'card', userId: 'assignee' });
	await f.service.updateCard('card', { reminderMinutesBefore: 60 }, 'actor');
	return {
		...f,
		repository: new CardReminderRepository(f.client),
		processor: new CardReminderService(new CardReminderRepository(f.client)),
		candidate: { ...f.state().reminders[0] },
	};
}

describe('durable card reminders', () => {
	it.each([0, 1, 59, 61, 1439, '60', false])('rejects reminder config %p', (value) => {
		expect(
			updateCardRequestBody.safeParse({ reminderMinutesBefore: value }).success,
		).toBe(false);
	});
	it.each([null, 60, 1440])('accepts reminder config %p', (value) => {
		expect(
			updateCardRequestBody.safeParse({ reminderMinutesBefore: value }).success,
		).toBe(true);
	});
	it('does not arm old deadlines by default and requires a deadline to enable', async () => {
		const f = cardFixture();
		await expect(
			f.service.updateCard('card', { reminderMinutesBefore: 60 }, 'actor'),
		).rejects.toMatchObject({ status: 422 });
		await f.service.updateCard('card', { dueDate }, 'actor');
		expect(f.state().reminders).toEqual([]);
		expect(f.state().cards[0].reminderMinutesBefore).toBeNull();
	});
	it('schedules at UTC deadline minus lead time; no-op preserves revision', async () => {
		const f = await fixture();
		expect(f.candidate.scheduledAt).toEqual(now);
		await f.service.updateCard(
			'card',
			{ reminderMinutesBefore: 60, dueDate },
			'actor',
		);
		expect(f.state().reminders[0]).toEqual(f.candidate);
	});
	it.each([{ dueDate: null }, { reminderMinutesBefore: null }])(
		'disables a stale candidate when %p',
		async (input) => {
			const f = await fixture();
			await f.service.updateCard('card', input, 'actor');
			expect(await f.processor.process(f.candidate, () => now)).toEqual([]);
			expect(f.state().reminders).toEqual([]);
			expect(f.state().notifications).toEqual([]);
		},
	);
	it('rotates revision on reschedule and ignores the old candidate', async () => {
		const f = await fixture();
		await f.service.updateCard(
			'card',
			{ dueDate: new Date(dueDate.getTime() + 60000) },
			'actor',
		);
		expect(f.state().reminders[0].revision).not.toBe(f.candidate.revision);
		expect(
			await f.processor.process(f.candidate, () => new Date(now.getTime() + 60000)),
		).toEqual([]);
	});
	it('creates at most one notification under concurrent workers and repeated consumption', async () => {
		const f = await fixture();
		const results = await Promise.all([
			f.processor.process(f.candidate, () => now),
			f.processor.process(f.candidate, () => now),
		]);
		expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
		expect(f.state().notifications).toHaveLength(1);
		expect(f.state().notifications[0]).toMatchObject({
			type: 'CARD_DUE_SOON',
			userId: 'assignee',
			metadata: { reminderRevision: f.candidate.revision },
		});
		expect(f.state().reminders[0].scheduledAt).toBeNull();
		expect(await f.processor.process(f.candidate, () => now)).toEqual([]);
	});
	it.each(['notification', 'commit'] as const)(
		'rolls back schedule consumption on %s failure',
		async (failure) => {
			const f = await fixture();
			f.failures[failure] = true;
			await expect(f.processor.process(f.candidate, () => now)).rejects.toThrow();
			expect(f.state().notifications).toEqual([]);
			expect(f.state().reminders[0].scheduledAt).toEqual(now);
			f.failures[failure] = false;
			expect(await f.processor.process(f.candidate, () => now)).toHaveLength(1);
		},
	);
	it('rolls back rescheduling when activity fails', async () => {
		const f = await fixture();
		f.failures.activity = true;
		await expect(
			f.service.updateCard('card', { reminderMinutesBefore: 1440 }, 'actor'),
		).rejects.toThrow();
		expect(f.state().cards[0].reminderMinutesBefore).toBe(60);
		expect(f.state().reminders[0]).toEqual(f.candidate);
	});
	it.each(['card', 'list', 'board', 'project', 'complete'])(
		'does not remind %s when inactive/completed',
		async (target) => {
			const f = await fixture();
			if (target === 'card') f.state().cards[0].status = 'ARCHIVED';
			if (target === 'list') f.state().lists[0].status = 'ARCHIVED';
			if (target === 'board') f.board.status = 'ARCHIVED';
			if (target === 'project') f.board.project.status = 'ARCHIVED';
			if (target === 'complete') f.state().cards[0].isComplete = true;
			expect(await f.processor.process(f.candidate, () => now)).toEqual([]);
			expect(f.state().reminders[0].scheduledAt).toEqual(now);
		},
	);
	it('skips overdue catch-up, including the exact deadline', async () => {
		const f = await fixture();
		expect(await f.processor.process(f.candidate, () => dueDate)).toEqual([]);
		expect(f.state().reminders[0].scheduledAt).toBeNull();
	});
	it('uses current assignments and access instead of an earlier recipient snapshot', async () => {
		const f = await fixture();
		f.state().assignments.push({ id: 'new', cardId: 'card', userId: 'new-assignee' });
		jest.spyOn(PermissionService.prototype, 'hasBoardPermission').mockImplementation(
			async (userId) => userId === 'new-assignee',
		);
		const result = await f.processor.process(f.candidate, () => now);
		expect(result.map((record) => record.userId)).toEqual(['new-assignee']);
	});
	it('does not remind before the configured time or after card deletion', async () => {
		const f = await fixture();
		expect(
			await f.processor.process(f.candidate, () => new Date(now.getTime() - 1)),
		).toEqual([]);
		await f.service.deleteCard('card', 'actor');
		expect(await f.processor.process(f.candidate, () => now)).toEqual([]);
	});
	it('delivers sockets after commit and keeps committed notifications if socket delivery fails', async () => {
		const f = await fixture();
		const delivery = jest.fn(async () => {
			expect(f.state().notifications).toHaveLength(1);
			expect(f.state().reminders[0].scheduledAt).toBeNull();
			throw new Error('socket offline');
		});
		jest.spyOn(console, 'error').mockImplementation(() => {});
		const worker = new CardReminderWorker(
			f.repository,
			{ deliver: delivery } as unknown as NotificationsService,
			() => now,
		);
		await worker.runOnce();
		await worker.runOnce();
		expect(delivery).toHaveBeenCalledTimes(1);
		expect(f.state().notifications).toHaveLength(1);
	});
});
