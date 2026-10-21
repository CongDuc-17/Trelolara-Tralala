import type { CardDetails, CardIncludes, CardQuery, CardRecord } from './cards.types';

export function isCardOverdue(
	card: Pick<CardRecord, 'dueDate' | 'isComplete'>,
	now = Date.now(),
): boolean {
	return !card.isComplete && card.dueDate !== null && card.dueDate.getTime() < now;
}

export function mapCard(card: CardQuery, include?: CardIncludes): CardDetails {
	return {
		id: card.id,
		title: card.title,
		description: card.description,
		dueDate: card.dueDate,
		isComplete: card.isComplete,
		reminderMinutesBefore: card.reminderMinutesBefore,
		isOverdue: isCardOverdue(card),
		position: card.position,
		listId: card.listId,
		createdAt: card.createdAt,
		memberCount: card._count?.cardMembers ?? 0,
		labelCount: card._count?.cardLabels ?? 0,
		checklistCount: card._count?.checklists ?? 0,
		commentCount: card._count?.comments ?? 0,
		_links: {
			members: `/cards/${card.id}/members`,
			labels: `/cards/${card.id}/labels`,
			checklists: `/cards/${card.id}/checklists`,
			comments: `/cards/${card.id}/comments`,
		},
		...(include
			? {
					members: include.members
						? card.cardMembers?.map((member) => ({
								id: member.id,
								userId: member.userId,
								userName: member.user.name,
								userAvatar: member.user.avatar,
							}))
						: undefined,
					labels: include.labels
						? card.cardLabels?.map(({ label }) => ({
								id: label.id,
								name: label.name,
								color: label.color,
							}))
						: undefined,
					checklists: include.checklists
						? card.checklists?.map((checklist) => ({
								id: checklist.id,
								title: checklist.title,
								checklistItems: checklist.checklistItems,
								itemCount: checklist.checklistItems.length,
								completedCount: checklist.checklistItems.filter(
									(item) => item.completed,
								).length,
							}))
						: undefined,
					comments: include.comments
						? card.comments?.map((comment) => ({
								id: comment.id,
								content: comment.content,
								createdAt: comment.createdAt,
								updatedAt: comment.updatedAt,
								userId: comment.user.id,
								userName: comment.user.name,
								userAvatar: comment.user.avatar,
							}))
						: undefined,
				}
			: {}),
	};
}
