import { AttachmentCleanupWorker } from '@/modules/attachments/attachment-cleanup.worker';
import {
	AttachmentCleanupRepository,
	type CleanupJob,
} from '@/modules/attachments/attachment-cleanup.repository';
import type { DatabaseClient } from '@/modules/database';

const now = new Date('2026-10-21T00:00:00Z');
const job: CleanupJob = {
	id: 'attachment',
	publicId: 'TrelloLike_Attachments/id.png',
	resourceType: 'raw',
	deliveryType: 'authenticated',
	availableAt: now,
	leaseId: 'lease',
	leaseUntil: new Date(now.getTime() + 300000),
	attempts: 1,
};
function fixture() {
	const repository = {
		claim: jest.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
		isReferenced: jest.fn().mockResolvedValue(false),
		finish: jest.fn(),
		retry: jest.fn(),
	};
	const storage = {
		delete: jest.fn().mockResolvedValue(undefined),
		upload: jest.fn(),
		download: jest.fn(),
	};
	return {
		repository,
		storage,
		worker: new AttachmentCleanupWorker(
			repository as unknown as AttachmentCleanupRepository,
			storage,
		),
	};
}
describe('Durable attachment cleanup', () => {
	it('deletes a claimed asset and finishes only after confirmation', async () => {
		const f = fixture();
		await f.worker.runOnce();
		expect(f.storage.delete).toHaveBeenCalledWith({
			publicId: job.publicId,
			resourceType: 'raw',
			deliveryType: 'authenticated',
		});
		expect(f.repository.finish).toHaveBeenCalledWith(job);
		expect(f.repository.retry).not.toHaveBeenCalled();
	});
	it('retries storage failure instead of losing the cleanup job', async () => {
		const f = fixture();
		f.storage.delete.mockRejectedValue(new Error('storage down'));
		await f.worker.runOnce();
		expect(f.repository.finish).not.toHaveBeenCalled();
		expect(f.repository.retry).toHaveBeenCalledWith(job, expect.any(Date));
	});
	it('keeps retrying if storage succeeded but removing the job failed', async () => {
		const f = fixture();
		f.repository.finish.mockRejectedValue(new Error('DB down'));
		await f.worker.runOnce();
		expect(f.repository.retry).toHaveBeenCalled();
	});
	it('preserves an asset still referenced by a different attachment', async () => {
		const f = fixture();
		f.repository.isReferenced.mockResolvedValue(true);
		await f.worker.runOnce();
		expect(f.storage.delete).not.toHaveBeenCalled();
		expect(f.repository.finish).toHaveBeenCalledWith(job);
	});
	it('does not overlap local batches and waits for running cleanup on stop', async () => {
		const f = fixture();
		let release!: () => void;
		f.storage.delete.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const first = f.worker.runOnce();
		const second = f.worker.runOnce();
		expect(second).toBe(first);
		await Promise.resolve();
		await Promise.resolve();
		const stopped = jest.fn();
		const stopping = f.worker.stop().then(stopped);
		expect(stopped).not.toHaveBeenCalled();
		release();
		await stopping;
		expect(f.storage.delete).toHaveBeenCalledTimes(1);
	});
	it('starts once, schedules after completion and cancels its next tick when stopped', async () => {
		jest.useFakeTimers();
		try {
			const f = fixture();
			f.repository.claim.mockReset().mockResolvedValue(null);
			f.worker.start();
			f.worker.start();
			await f.worker.runOnce();
			expect(f.repository.claim).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(60000);
			expect(f.repository.claim).toHaveBeenCalledTimes(2);
			await f.worker.stop();
			await jest.advanceTimersByTimeAsync(60000);
			expect(f.repository.claim).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});
	it('claims with a conditional lease so only one of two concurrent workers wins', async () => {
		let claimed = false;
		const client = {
			attachmentCleanupJobs: {
				findFirst: jest.fn().mockResolvedValue({
					...job,
					leaseId: null,
					leaseUntil: null,
					attempts: 0,
				}),
				updateMany: jest.fn(async () => {
					if (claimed) return { count: 0 };
					claimed = true;
					return { count: 1 };
				}),
			},
		};
		const repository = new AttachmentCleanupRepository(
			client as unknown as DatabaseClient,
		);
		const results = await Promise.all([repository.claim(now), repository.claim(now)]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(client.attachmentCleanupJobs.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					availableAt: { lte: now },
					OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
				},
			}),
		);
		expect(client.attachmentCleanupJobs.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: job.id,
					availableAt: { lte: now },
					OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
				}),
				data: expect.objectContaining({
					leaseId: expect.any(String),
					leaseUntil: new Date(now.getTime() + 300000),
				}),
			}),
		);
	});
	it('uses a capped retry delay and a lease condition when completing or rescheduling', async () => {
		const client = {
			attachmentCleanupJobs: { updateMany: jest.fn(), deleteMany: jest.fn() },
		};
		const repository = new AttachmentCleanupRepository(
			client as unknown as DatabaseClient,
		);
		await repository.retry({ ...job, attempts: 1000 }, now);
		expect(client.attachmentCleanupJobs.updateMany).toHaveBeenCalledWith({
			where: { id: job.id, leaseId: job.leaseId },
			data: {
				availableAt: new Date(now.getTime() + 3600000),
				leaseId: null,
				leaseUntil: null,
			},
		});
		await repository.finish(job);
		expect(client.attachmentCleanupJobs.deleteMany).toHaveBeenCalledWith({
			where: { id: job.id, leaseId: job.leaseId },
		});
	});
});
