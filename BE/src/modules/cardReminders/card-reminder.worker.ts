import { NotificationsService } from '../notifications/notifications.service';
import { CardReminderRepository } from './card-reminder.repository';
import { CardReminderService } from './card-reminder.service';

export class CardReminderWorker {
	private timer?: ReturnType<typeof setTimeout>;
	private running?: Promise<void>;
	private stopped = true;
	constructor(
		private readonly repository = new CardReminderRepository(),
		private readonly notifications = new NotificationsService(),
		private readonly clock = () => new Date(),
		private readonly service = new CardReminderService(repository),
	) {}
	runOnce(): Promise<void> {
		if (this.running) return this.running;
		this.running = this.runBatch()
			.catch(() => {
				console.error('[Reminders] Batch failed');
			})
			.finally(() => {
				this.running = undefined;
			});
		return this.running;
	}
	private async runBatch(): Promise<void> {
		for (const candidate of await this.repository.findDue(this.clock())) {
			try {
				const records = await this.service.process(candidate, this.clock);
				await this.notifications.deliver(records);
			} catch {
				console.error('[Reminders] Reminder failed');
			}
		}
	}
	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		const tick = async () => {
			await this.runOnce();
			if (!this.stopped) {
				this.timer = setTimeout(() => {
					void tick();
				}, 30000);
				this.timer.unref();
			}
		};
		void tick();
	}
	async stop(): Promise<void> {
		this.stopped = true;
		clearTimeout(this.timer);
		await this.running;
	}
}
