import type { CardDetailDto } from "@/features/cards/types";

export const testCard: CardDetailDto = {
  id: "00000000-0000-4000-8000-000000000001",
  listId: "00000000-0000-4000-8000-000000000002",
  title: "Kiểm tra bình luận",
  position: 1,
  dueDate: null,
  isComplete: false,
  isOverdue: false,
  reminderMinutesBefore: null,
  comments: [],
  description: null,
  members: [],
  labels: [],
  checklists: [],
  commentCount: 0,
};

// Matches BE's POST /cards/:cardId/comments JSON envelope; dates cross HTTP as strings.
export const commentResponse = {
  success: true as const,
  data: {
    commentId: "00000000-0000-4000-8000-000000000003",
    cardId: testCard.id,
    content: "Đã kiểm tra thẻ",
    user: {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Thành viên kiểm thử",
      email: "member@example.test",
      avatar: null,
    },
    createdAt: "2026-10-22T03:00:00.000Z",
    updatedAt: "2026-10-22T03:00:00.000Z",
  },
};
