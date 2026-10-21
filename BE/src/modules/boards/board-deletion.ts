import type { DatabaseClient } from '../database';
import { deleteAttachments } from '../attachments/attachment-deletion';

/** Caller owns the transaction so project deletion can include every board. */
export async function deleteBoardTree(
	client: DatabaseClient,
	boardId: string,
): Promise<void> {
	const card = { list: { boardId } };
	await client.checklistItems.deleteMany({
		where: { checklist: { card } },
	});
	await client.checklists.deleteMany({ where: { card } });
	await client.cardLabels.deleteMany({
		// Legacy relations can connect a card and a label from different boards.
		where: { OR: [{ card }, { label: { boardId } }] },
	});
	await client.cardMembers.deleteMany({ where: { card } });
	await client.cardComments.deleteMany({ where: { card } });
	await deleteAttachments(client, { boardId });
	await client.cardActivity.deleteMany({ where: { card } });
	await client.cards.deleteMany({ where: card });
	await client.lists.deleteMany({ where: { boardId } });
	await client.labels.deleteMany({ where: { boardId } });
	await client.boardMembers.deleteMany({ where: { boardId } });
	await client.invitations.deleteMany({ where: { boardId } });
	await client.boards.delete({ where: { id: boardId } });
}
