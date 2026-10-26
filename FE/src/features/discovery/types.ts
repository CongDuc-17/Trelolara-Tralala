import type { CardRow, Label } from "@/features/cards/types";

export type TaskFilters = {
  keyword?: string;
  memberIds?: string[];
  labelIds?: string[];
  isComplete?: boolean;
  due?: "overdue" | "soon" | "none";
  status?: "ACTIVE" | "ARCHIVED" | "ALL";
};
export type Task = CardRow & {
  isOverdue: boolean;
  createdAt: string;
  _count: { attachments: number };
  list: { id: string; name: string; status: string; board: { id: string; name: string; status: string; projectId: string; project: { status: string } } };
  cardMembers: { userId: string; user: { id: string; name: string; avatar: string | null } }[];
  cardLabels: { label: Label }[];
};
export type TaskPage = { items: Task[]; nextCursor: string | null };
