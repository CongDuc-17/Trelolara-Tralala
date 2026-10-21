import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import type { DatabaseClient } from '@/modules/database';

describe('Lifecycle lookup follows the persisted list ancestry', () => {
	const state = { status: 'ARCHIVED', deletedAt: new Date() };
	it.each(['listId', 'cardId', 'checklistId', 'checklistItemId', 'commentId'])(
		'reads list state through %s without trusting an unrelated list reference',
		async (key) => {
			const row =
				key === 'listId'
					? state
					: key === 'cardId'
						? { list: state }
						: key === 'checklistItemId'
							? { checklist: { card: { list: state } } }
							: { card: { list: state } };
			const findUnique = jest
				.fn()
				.mockResolvedValueOnce(row)
				.mockResolvedValueOnce(null);
			const model =
				key === 'listId'
					? 'lists'
					: key === 'cardId'
						? 'cards'
						: key === 'checklistId'
							? 'checklists'
							: key === 'checklistItemId'
								? 'checklistItems'
								: 'cardComments';
			const repository = new PermissionsRepository({
				[model]: { findUnique },
			} as unknown as DatabaseClient);
			await expect(
				repository.findListState({ [key]: 'resource' }),
			).resolves.toEqual(state);
			expect(findUnique).toHaveBeenLastCalledWith(
				expect.objectContaining({ where: { id: 'resource' } }),
			);
			await expect(
				repository.findListState({ [key]: 'missing' }),
			).resolves.toBeNull();
		},
	);

	it('has no list state for a board-level label', async () => {
		const repository = new PermissionsRepository({} as DatabaseClient);
		await expect(repository.findListState({ labelId: 'label' })).resolves.toBeNull();
	});
});
