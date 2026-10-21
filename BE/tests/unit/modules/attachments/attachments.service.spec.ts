import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { AttachmentsRepository } from '@/modules/attachments/attachments.repository';
import { AttachmentCleanupRepository } from '@/modules/attachments/attachment-cleanup.repository';
import type {
	AttachmentRecord,
	StoredAttachment,
} from '@/modules/attachments/attachments.types';
import { cardFixture, makeCard, now } from '../cards/cards.fixture';
import { attachmentFile } from '../../../fixtures/attachment-files';

const target = {
	publicId: 'TrelloLike_Attachments/attachment.png',
	resourceType: 'raw',
	deliveryType: 'authenticated',
};
const row = (id = 'attachment', cardId = 'card'): AttachmentRecord => ({
	id,
	cardId,
	userId: 'actor',
	fileName: 'sample.png',
	fileSize: 10,
	mimeType: 'image/png',
	fileUrl: 'https://legacy.invalid/private-url',
	storagePublicId: target.publicId,
	storageResourceType: target.resourceType,
	storageDeliveryType: target.deliveryType,
	createdAt: now,
});
function fixture() {
	const f = cardFixture([makeCard('card'), makeCard('other')]);
	const storage = {
		upload: jest.fn(async (_file: unknown, asset: StoredAttachment) => ({
			...asset,
		})),
		delete: jest.fn(),
		download: jest.fn(() => 'https://provider.invalid/temporary'),
	};
	const service = new AttachmentsService(
		new AttachmentsRepository(f.client),
		f.service,
		storage,
		new AttachmentCleanupRepository(f.client),
	);
	return { ...f, storage, attachments: service };
}

describe('Attachments use cases', () => {
	it('uploads outside parent locks, then atomically saves metadata/activity and cancels crash cleanup', async () => {
		const f = fixture();
		f.storage.upload.mockImplementation(async (_file, asset) => {
			expect(f.events[f.events.length - 1]).toBe('1:commit');
			expect(f.state().cleanupJobs).toHaveLength(1);
			return asset;
		});
		const file = { ...attachmentFile(), size: 1 };
		const result = await f.attachments.upload('card', 'actor', file);
		expect(result).toMatchObject({
			cardId: 'card',
			userId: 'actor',
			fileName: 'sample.png',
			fileSize: file.buffer.length,
			mimeType: 'image/png',
			downloadUrl: expect.stringContaining('/download'),
		});
		expect(result).not.toHaveProperty('storagePublicId');
		expect(result).not.toHaveProperty('fileUrl');
		expect(f.state().cleanupJobs).toEqual([]);
		expect(f.state().attachments).toHaveLength(1);
		expect(f.state().activities).toMatchObject([
			{ action: 'attachment_added', userId: 'actor' },
		]);
		expect(JSON.stringify(f.state().activities[0].metadata)).not.toContain(
			'https://',
		);
		expect(f.storage.delete).not.toHaveBeenCalled();
	});
	it.each(['attachment', 'activity'] as const)(
		'rolls back attachment/activity and schedules cleanup if %s fails',
		async (failure) => {
			const f = fixture();
			f.failures[failure] = true;
			await expect(
				f.attachments.upload('card', 'actor', attachmentFile()),
			).rejects.toThrow();
			expect(f.state().attachments).toEqual([]);
			expect(f.state().activities).toEqual([]);
			expect(f.state().cleanupJobs).toHaveLength(1);
			expect(f.state().cleanupJobs[0].availableAt!.getTime()).toBeLessThanOrEqual(
				Date.now(),
			);
		},
	);
	it('keeps cleanup if commit fails after metadata/activity writes', async () => {
		const f = fixture();
		f.storage.upload.mockImplementation(async (_file, asset) => {
			f.failures.commit = true;
			return asset;
		});
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toThrow('Commit failed');
		expect(f.state().attachments).toEqual([]);
		expect(f.state().activities).toEqual([]);
		expect(f.state().cleanupJobs).toHaveLength(1);
	});
	it.each(['archive', 'remove-member', 'delete-card'] as const)(
		'rechecks %s after the network call and keeps cleanup durable',
		async (change) => {
			const f = fixture();
			f.storage.upload.mockImplementation(async (_file, asset) => {
				if (change === 'archive') await f.service.archiveCard('card', 'actor');
				else if (change === 'remove-member') f.access.allowed = false;
				else await f.service.deleteCard('card', 'actor');
				return asset;
			});
			await expect(
				f.attachments.upload('card', 'actor', attachmentFile()),
			).rejects.toMatchObject({
				status:
					change === 'archive' ? 409 : change === 'remove-member' ? 403 : 404,
			});
			expect(f.state().attachments).toEqual([]);
			expect(f.state().cleanupJobs).toHaveLength(1);
		},
	);
	it('retains the 24-hour safety delay for an uncertain upload timeout', async () => {
		const f = fixture();
		f.storage.upload.mockRejectedValue(new Error('timeout'));
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toThrow('timeout');
		expect(f.state().cleanupJobs[0].availableAt!.getTime()).toBeGreaterThan(
			Date.now() + 23 * 60 * 60 * 1000,
		);
	});
	it('does not publish metadata after the upload reservation expires', async () => {
		const f = fixture();
		f.storage.upload.mockImplementation(async (_file, asset) => {
			f.state().cleanupJobs[0].availableAt = new Date(0);
			return asset;
		});
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toMatchObject({ status: 409 });
		expect(f.state().attachments).toEqual([]);
		expect(f.state().cleanupJobs).toHaveLength(1);
	});
	it('preserves the original failure and crash reservation if cleanup scheduling fails', async () => {
		const f = fixture();
		f.failures.attachment = true;
		f.failures.expedite = true;
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toThrow('Attachment write failed');
		expect(f.state().cleanupJobs).toHaveLength(1);
	});
	it('does not upload for invalid files, outsiders, viewers or archived cards', async () => {
		const f = fixture();
		await expect(f.attachments.upload('card', 'actor')).rejects.toMatchObject({
			status: 422,
		});
		f.access.allowed = false;
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toMatchObject({ status: 403 });
		f.access.allowed = true;
		f.access.role = 'BOARD_VIEWER';
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toMatchObject({ status: 403 });
		f.access.role = 'BOARD_MEMBER';
		f.board.status = 'ARCHIVED';
		await expect(
			f.attachments.upload('card', 'actor', attachmentFile()),
		).rejects.toMatchObject({ status: 409 });
		expect(f.storage.upload).not.toHaveBeenCalled();
	});
	it('allows viewer reads/downloads under archive, hides legacy URLs and issues a 60-second download', async () => {
		const f = fixture();
		f.access.role = 'BOARD_VIEWER';
		f.board.status = 'ARCHIVED';
		f.state().attachments.push(row(), { ...row('legacy'), storagePublicId: null });
		const listed = await f.attachments.list('card', 'actor');
		expect(listed).toHaveLength(2);
		expect(listed[1].downloadUrl).toBeNull();
		expect(JSON.stringify(listed)).not.toContain('legacy.invalid');
		const before = Date.now();
		const download = await f.attachments.download('card', 'attachment', 'actor');
		expect(download.url).toBe('https://provider.invalid/temporary');
		expect(download.expiresAt.getTime() - before).toBeGreaterThanOrEqual(59000);
		expect(download.expiresAt.getTime() - before).toBeLessThanOrEqual(60000);
		await expect(
			f.attachments.download('card', 'legacy', 'actor'),
		).rejects.toMatchObject({ status: 409 });
	});
	it('does not read/download/delete an attachment from another card or expose it to outsiders', async () => {
		const f = fixture();
		f.state().attachments.push(row('foreign', 'other'));
		await expect(
			f.attachments.download('card', 'foreign', 'actor'),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			f.attachments.delete('card', 'foreign', 'actor'),
		).rejects.toMatchObject({ status: 404 });
		f.access.allowed = false;
		await expect(f.attachments.list('card', 'actor')).rejects.toMatchObject({
			status: 403,
		});
		await expect(
			f.attachments.download('other', 'foreign', 'actor'),
		).rejects.toMatchObject({ status: 403 });
		expect(f.storage.download).not.toHaveBeenCalled();
	});
	it('deletes on archive by DELETE_CARD, queues storage cleanup and records activity without calling storage', async () => {
		const f = fixture();
		f.state().attachments.push(row(), row('foreign', 'other'));
		f.board.project.status = 'ARCHIVED';
		await f.attachments.delete('card', 'attachment', 'actor');
		expect(f.state().attachments.map((asset) => asset.id)).toEqual(['foreign']);
		expect(f.state().cleanupJobs).toMatchObject([
			{ id: 'attachment', publicId: target.publicId },
		]);
		expect(f.state().activities).toMatchObject([{ action: 'attachment_deleted' }]);
		expect(f.storage.delete).not.toHaveBeenCalled();
	});
	it.each(['cleanupJob', 'activity'] as const)(
		'rolls deletion and cleanup back if %s fails',
		async (failure) => {
			const f = fixture();
			f.state().attachments.push(row());
			f.failures[failure] = true;
			await expect(
				f.attachments.delete('card', 'attachment', 'actor'),
			).rejects.toThrow();
			expect(f.state().attachments).toHaveLength(1);
			expect(f.state().cleanupJobs).toEqual([]);
			expect(f.state().activities).toEqual([]);
		},
	);
	it('queues known storage keys before card deletion and retains unknown legacy metadata for reconciliation', async () => {
		const f = fixture();
		f.state().attachments.push(row(), { ...row('legacy'), storagePublicId: null });
		await f.service.deleteCard('card', 'actor');
		expect(f.state().attachments).toEqual([]);
		expect(f.state().cleanupJobs).toHaveLength(2);
		expect(f.state().cleanupJobs[1]).toMatchObject({
			id: 'legacy',
			availableAt: null,
			legacyFileUrl: 'https://legacy.invalid/private-url',
		});
	});
	it('rolls a whole card deletion and its jobs back if a later child deletion fails', async () => {
		const f = fixture();
		f.state().attachments.push(row());
		f.failures.deleteTable = 'cardActivity';
		await expect(f.service.deleteCard('card', 'actor')).rejects.toThrow();
		expect(f.state().cards.map((card) => card.id)).toContain('card');
		expect(f.state().attachments).toHaveLength(1);
		expect(f.state().cleanupJobs).toEqual([]);
	});
	it('serializes concurrent attachment deletions without creating duplicate activity or jobs', async () => {
		const f = fixture();
		f.state().attachments.push(row());
		const results = await Promise.allSettled([
			f.attachments.delete('card', 'attachment', 'actor'),
			f.attachments.delete('card', 'attachment', 'actor'),
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find((result) => result.status === 'rejected')).toMatchObject({
			reason: { status: 404 },
		});
		expect(f.state().activities).toHaveLength(1);
		expect(f.state().cleanupJobs).toHaveLength(1);
	});
});
