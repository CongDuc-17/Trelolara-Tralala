import type { DatabaseClient } from '../database';

export async function deleteCardTree(
	client: DatabaseClient,
	cardId: string,
): Promise<void> {
	await client.checklistItems.deleteMany({ where: { checklist: { cardId } } });
	await client.checklists.deleteMany({ where: { cardId } });
	await client.cardLabels.deleteMany({ where: { cardId } });
	await client.cardMembers.deleteMany({ where: { cardId } });
	await client.cardComments.deleteMany({ where: { cardId } });
	await client.cardAttachments.deleteMany({ where: { cardId } });
	await client.cardActivity.deleteMany({ where: { cardId } });
	await client.cards.delete({ where: { id: cardId } });
}
