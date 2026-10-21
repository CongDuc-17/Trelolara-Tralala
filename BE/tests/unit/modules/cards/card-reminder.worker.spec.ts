import { CardReminderWorker } from '@/modules/cardReminders/card-reminder.worker';
import { CardReminderRepository } from '@/modules/cardReminders/card-reminder.repository';
import { CardReminderService } from '@/modules/cardReminders/card-reminder.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('card reminder worker lifecycle', () => {
	afterEach(() => jest.useRealTimers());
	function fixture() {
		const findDue = jest.fn().mockResolvedValue([]);
		const process = jest.fn().mockResolvedValue([]);
		const deliver = jest.fn().mockResolvedValue(true);
		const clock = () => new Date('2026-10-21T00:00:00Z');
		const worker = new CardReminderWorker(
			{ findDue } as unknown as CardReminderRepository,
			{ deliver } as unknown as NotificationsService,
			clock,
			{ process } as unknown as CardReminderService,
		);
		return { worker, findDue, process, deliver };
	}
	it('starts once, polls persisted candidates and stops scheduling on shutdown', async () => {
		jest.useFakeTimers();
		const f = fixture();
		f.worker.start();
		f.worker.start();
		await jest.advanceTimersByTimeAsync(0);
		expect(f.findDue).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(30000);
		expect(f.findDue).toHaveBeenCalledTimes(2);
		await f.worker.stop();
		await jest.advanceTimersByTimeAsync(60000);
		expect(f.findDue).toHaveBeenCalledTimes(2);
	});
	it('does not overlap batches and waits for an active batch when stopping', async () => {
		const f = fixture();
		let finish!: () => void;
		f.findDue.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			}).then(() => []),
		);
		const running = f.worker.runOnce();
		expect(f.worker.runOnce()).toBe(running);
		let stopped = false;
		const stop = f.worker.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		finish();
		await stop;
		expect(stopped).toBe(true);
		expect(f.findDue).toHaveBeenCalledTimes(1);
	});
	it('does not emit for a failed transaction and continues other candidates', async () => {
		const f = fixture();
		jest.spyOn(console, 'error').mockImplementation(() => {});
		f.findDue.mockResolvedValue([
			{ cardId: 'one', revision: '1' },
			{ cardId: 'two', revision: '2' },
		]);
		f.process
			.mockRejectedValueOnce(new Error('rollback'))
			.mockResolvedValueOnce([{ id: 'committed' }]);
		await f.worker.runOnce();
		expect(f.deliver).toHaveBeenCalledTimes(1);
		expect(f.deliver).toHaveBeenCalledWith([{ id: 'committed' }]);
	});
});
