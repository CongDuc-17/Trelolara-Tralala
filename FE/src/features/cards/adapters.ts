import type { CardBase, CardDetail, CardDetailDto, CardListDto, CardSummary, Comment, CommentDto } from "./types";

function checkCard(card: CardBase) {
  if (!card || typeof card.id !== "string" || !card.id || typeof card.listId !== "string" ||
    typeof card.title !== "string" || !Number.isFinite(card.position) ||
    !(card.description === null || typeof card.description === "string") ||
    !(card.dueDate === null || (typeof card.dueDate === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(card.dueDate) && Number.isFinite(Date.parse(card.dueDate)))) ||
    typeof card.isComplete !== "boolean" || ![null, 60, 1440].includes(card.reminderMinutesBefore)) {
    throw new Error("Dữ liệu thẻ không hợp lệ.");
  }
}

export function readCardBase(card: CardBase, id: string) {
  checkCard(card);
  if (card.id !== id) throw new Error("Dữ liệu thẻ không khớp yêu cầu.");
  return card;
}

export function readCardList(value: CardListDto[], listId: string): CardSummary[] {
  if (!Array.isArray(value)) throw new Error("Dữ liệu danh sách thẻ không hợp lệ.");
  return value.map((card) => {
    checkCard(card);
    if (card.listId !== listId || !["ACTIVE", "ARCHIVED"].includes(card.status) || typeof card.isOverdue !== "boolean" ||
      !Array.isArray(card.cardMembers) || !Array.isArray(card.cardLabels) || !Array.isArray(card.checklists) ||
      !Number.isInteger(card._count?.comments) || card._count.comments < 0 || !Number.isSafeInteger(card._count.attachments) || card._count.attachments < 0) throw new Error("Dữ liệu quan hệ thẻ không hợp lệ.");
    return {
      id: card.id, listId: card.listId, title: card.title, description: card.description, position: card.position, status: card.status,
      dueDate: card.dueDate, isComplete: card.isComplete, isOverdue: card.isOverdue, reminderMinutesBefore: card.reminderMinutesBefore,
      members: card.cardMembers.map(({ id, userId, user }) => ({ id, userId, userName: user.name, userAvatar: user.avatar })),
      labels: card.cardLabels.map(({ label }) => label), checklists: card.checklists, commentCount: card._count.comments, attachmentCount: card._count.attachments,
    };
  });
}

export function readCardDetail(card: CardDetailDto, id: string): CardDetail {
  checkCard(card);
  if (card.id !== id || typeof card.isOverdue !== "boolean" || !Array.isArray(card.members) || !Array.isArray(card.labels) ||
    !Array.isArray(card.checklists) || !Array.isArray(card.comments) || !Number.isInteger(card.commentCount) || card.commentCount < 0 || !Number.isSafeInteger(card.attachmentCount) || card.attachmentCount < 0) {
    throw new Error("Chưa tải đủ quan hệ chi tiết thẻ.");
  }
  return { ...card, members: card.members, labels: card.labels, checklists: card.checklists,
    comments: card.comments.map((comment) => ({ ...comment, cardId: id })) };
}

export function readComment(comment: CommentDto, cardId: string): Comment {
  if (comment.cardId !== cardId || !comment.commentId || !comment.user?.id) throw new Error("Phản hồi bình luận không hợp lệ.");
  return { id: comment.commentId, cardId, content: comment.content, createdAt: comment.createdAt, updatedAt: comment.updatedAt,
    userId: comment.user.id, userName: comment.user.name, userAvatar: comment.user.avatar ?? null };
}
