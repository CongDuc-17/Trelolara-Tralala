import { randomUUID } from 'node:crypto';
import { OptionalException } from '@/common/exceptions';
import { prisma, type DatabaseClient } from '../database';
import type { StoredAttachment } from './attachments.types';

export interface CleanupJob {
	id: string;
	publicId: string | null;
	resourceType: string | null;
	deliveryType: string | null;
	leaseId: string | null;
	leaseUntil: Date | null;
	availableAt: Date | null;
	attempts: number;
}
export class AttachmentCleanupRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	reserveUpload(id: string, target: StoredAttachment): Promise<CleanupJob> {
		return this.client.attachmentCleanupJobs.create({
			data: {
				id,
				...target,
				availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			},
		});
	}
	async completeUpload(id: string, client: DatabaseClient): Promise<void> {
		const cancelled = await client.attachmentCleanupJobs.deleteMany({
			where: { id, leaseId: null, availableAt: { gt: new Date() } },
		});
		if (cancelled.count !== 1)
			throw new OptionalException(
				409,
				'Upload reservation expired; retry the upload',
			);
	}
	async expedite(id: string): Promise<void> {
		await this.client.attachmentCleanupJobs.updateMany({
			where: { id, leaseId: null },
			data: { availableAt: new Date() },
		});
	}
	async claim(now: Date): Promise<CleanupJob | null> {
		const where = {
			availableAt: { lte: now },
			OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
		};
		const job = await this.client.attachmentCleanupJobs.findFirst({
			where,
			orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
		});
		if (!job) return null;
		const leaseId = randomUUID();
		const leaseUntil = new Date(now.getTime() + 5 * 60 * 1000);
		const claimed = await this.client.attachmentCleanupJobs.updateMany({
			where: { ...where, id: job.id },
			data: { leaseId, leaseUntil, attempts: { increment: 1 } },
		});
		return claimed.count === 1
			? { ...job, leaseId, leaseUntil, attempts: job.attempts + 1 }
			: null;
	}
	async isReferenced(job: CleanupJob): Promise<boolean> {
		return !!(await this.client.cardAttachments.findFirst({
			where: {
				storagePublicId: job.publicId,
				storageResourceType: job.resourceType,
				storageDeliveryType: job.deliveryType,
			},
			select: { id: true },
		}));
	}
	async finish(job: CleanupJob): Promise<void> {
		await this.client.attachmentCleanupJobs.deleteMany({
			where: { id: job.id, leaseId: job.leaseId },
		});
	}
	async retry(job: CleanupJob, now: Date): Promise<void> {
		const delay = Math.min(
			60 * 60 * 1000,
			60000 * 2 ** Math.min(job.attempts - 1, 6),
		);
		await this.client.attachmentCleanupJobs.updateMany({
			where: { id: job.id, leaseId: job.leaseId },
			data: {
				availableAt: new Date(now.getTime() + delay),
				leaseId: null,
				leaseUntil: null,
			},
		});
	}
}
