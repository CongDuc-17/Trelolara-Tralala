import { AttachmentCleanupRepository } from './attachment-cleanup.repository';
import { CloudinaryAttachmentStorage } from './attachment.storage';
import type { AttachmentStorage } from './attachments.types';

export class AttachmentCleanupWorker {
	private timer?: ReturnType<typeof setTimeout>;
	private running?: Promise<void>;
	private stopped = true;
	constructor(
		private readonly repository = new AttachmentCleanupRepository(),
		private readonly storage: AttachmentStorage = new CloudinaryAttachmentStorage(),
	) {}
	runOnce(): Promise<void> {
		if (this.running) return this.running;
		this.running = this.runBatch()
			.catch(() => {
				console.error('[Attachments] Cleanup batch failed');
			})
			.finally(() => {
				this.running = undefined;
			});
		return this.running;
	}
	private async runBatch(): Promise<void> {
		for (let count = 0; count < 20; count++) {
			const job = await this.repository.claim(new Date());
			if (!job) return;
			try {
				if (!job.publicId || !job.resourceType || !job.deliveryType)
					throw new Error('Unresolved cleanup key');
				if (!(await this.repository.isReferenced(job))) {
					await this.storage.delete({
						publicId: job.publicId,
						resourceType: job.resourceType,
						deliveryType: job.deliveryType,
					});
				}
				await this.repository.finish(job);
			} catch {
				console.error('[Attachments] Cleanup job failed', job.id);
				await this.repository.retry(job, new Date());
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
				}, 60000);
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
