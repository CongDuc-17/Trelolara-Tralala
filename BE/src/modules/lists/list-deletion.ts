import type { DatabaseClient } from '../database';

/** Caller holds the parent locks and owns the transaction. */
export async function deleteListTree(
	client: DatabaseClient,
	listId: string,
): Promise<void> {
	const card = { listId };
	await client.checklistItems.deleteMany({
		where: { checklist: { card } },
	});
	await client.checklists.deleteMany({ where: { card } });
	await client.cardLabels.deleteMany({ where: { card } });
	await client.cardMembers.deleteMany({ where: { card } });
	await client.cardComments.deleteMany({ where: { card } });
	await client.cardAttachments.deleteMany({ where: { card } });
	await client.cardActivity.deleteMany({ where: { card } });
	await client.cards.deleteMany({ where: card });
	await client.lists.delete({ where: { id: listId } });
}
