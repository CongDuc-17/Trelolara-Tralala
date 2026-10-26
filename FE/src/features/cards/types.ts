export type ReminderMinutes = 60 | 1440 | null;
export type CardBase = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  isComplete: boolean;
  reminderMinutesBefore: ReminderMinutes;
};
export type Label = { id: string; name: string; color: string };
export type CardMember = { id: string; userId: string; userName: string; userAvatar: string | null };
export type ChecklistItem = { id: string; title: string; completed: boolean };
export type Checklist = { id: string; title: string; checklistItems: ChecklistItem[] };
export type Comment = { id: string; cardId: string; content: string; userId: string; userName: string; userAvatar: string | null; createdAt: string; updatedAt: string };
export type CardRow = CardBase & { status: "ACTIVE" | "ARCHIVED" };
export type CardSummary = CardRow & { isOverdue: boolean; members: CardMember[]; labels: Label[]; checklists: Checklist[]; commentCount: number; attachmentCount: number };
export type CardDetail = CardBase & { isOverdue: boolean; members: CardMember[]; labels: Label[]; checklists: Checklist[]; comments: Comment[]; commentCount: number; attachmentCount: number };

// List reads, included detail reads and writes are different BE projections.
export type CardListDto = CardRow & {
  isOverdue: boolean;
  cardMembers: { id: string; userId: string; user: { id: string; name: string; avatar: string | null } }[];
  cardLabels: { id: string; label: Label }[];
  checklists: Checklist[];
  _count: { comments: number; attachments: number };
};
export type CardDetailDto = CardBase & {
  isOverdue: boolean;
  members?: CardMember[]; labels?: Label[]; checklists?: Checklist[];
  comments?: Omit<Comment, "cardId">[]; commentCount: number; attachmentCount: number;
};
export type CommentDto = Omit<Comment, "id" | "userId" | "userName" | "userAvatar"> & {
  commentId: string;
  user: { id: string; name: string; avatar?: string | null };
};
export type ChecklistItemDto = { id: string; checklistId: string; title: string; isCompleted: boolean };
export type UpdateCardInput = Partial<Pick<CardBase, "title" | "description" | "dueDate" | "isComplete" | "reminderMinutesBefore">>;
export type MoveCardInput = { targetListId: string; beforeCardId?: string; afterCardId?: string };
export type LabelInput = Pick<Label, "name" | "color">;
export type CardAttachment = {
  id: string; cardId: string; userId: string; fileName: string; fileSize: number;
  mimeType: string | null; createdAt: string; downloadUrl: string | null;
};
export type CardActivity = {
  id: string; cardId: string; userId: string; action: string; details: string | null;
  metadata: Record<string, unknown> | null; createdAt: string;
  actor: { id: string; name: string; avatar: string | null };
};
export type CardActivityPage = { items: CardActivity[]; nextCursor: string | null };
