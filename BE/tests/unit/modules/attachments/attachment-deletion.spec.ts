import { deleteAttachments } from '@/modules/attachments/attachment-deletion';
import type { DatabaseClient } from '@/modules/database';

const known = {
	id: 'known',
	storagePublicId: 'TrelloLike_Attachments/known.png',
	storageResourceType: 'raw',
	storageDeliveryType: 'authenticated',
	fileUrl: '/cards/card/attachments/known/download',
};
describe('Attachment cleanup when deleting a tree', () => {
	it.each([
		[{ cardId: 'card' }, { cardId: 'card' }],
		[
			{ cardId: 'card', attachmentId: 'attachment' },
			{ cardId: 'card', id: 'attachment' },
		],
		[{ listId: 'list' }, { card: { listId: 'list' } }],
		[{ boardId: 'board' }, { card: { list: { boardId: 'board' } } }],
	] as const)(
		'queues cleanup before deleting only the selected scope %j',
		async (scope, where) => {
			const events: string[] = [];
			const client = {
				cardAttachments: {
					findMany: jest.fn().mockResolvedValue([
						known,
						{
							...known,
							id: 'legacy',
							storagePublicId: null,
							fileUrl: 'https://unknown.invalid/file.png',
						},
					]),
					deleteMany: jest.fn(async () => {
						events.push('delete');
					}),
				},
				attachmentCleanupJobs: {
					createMany: jest.fn(async () => {
						events.push('queue');
					}),
				},
			};
			await deleteAttachments(client as unknown as DatabaseClient, scope);
			expect(client.cardAttachments.findMany).toHaveBeenCalledWith({ where });
			expect(client.cardAttachments.deleteMany).toHaveBeenCalledWith({ where });
			expect(client.attachmentCleanupJobs.createMany).toHaveBeenCalledWith({
				skipDuplicates: true,
				data: [
					expect.objectContaining({
						id: 'known',
						publicId: known.storagePublicId,
						availableAt: expect.any(Date),
					}),
					expect.objectContaining({
						id: 'legacy',
						publicId: null,
						availableAt: null,
						legacyFileUrl: 'https://unknown.invalid/file.png',
					}),
				],
			});
			expect(events).toEqual(['queue', 'delete']);
		},
	);
	it('does not discard metadata if the durable cleanup write fails', async () => {
		const client = {
			cardAttachments: {
				findMany: jest.fn().mockResolvedValue([known]),
				deleteMany: jest.fn(),
			},
			attachmentCleanupJobs: {
				createMany: jest.fn().mockRejectedValue(new Error('DB error')),
			},
		};
		await expect(
			deleteAttachments(client as unknown as DatabaseClient, { cardId: 'card' }),
		).rejects.toThrow('DB error');
		expect(client.cardAttachments.deleteMany).not.toHaveBeenCalled();
	});
});
