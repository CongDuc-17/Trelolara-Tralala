import { apiClient } from "@/lib/apiClient";
import { readCardBase } from "@/features/cards/adapters";
import { isRecord } from "@/features/notifications/types";
import { taskParams } from "./filters";
import type { TaskFilters, TaskPage } from "./types";

export function readTaskPage(value: TaskPage, boardId?: string): TaskPage {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 100 ||
    !(value.nextCursor === null || (typeof value.nextCursor === "string" && value.items.at(-1)?.id === value.nextCursor))) throw new Error("Dữ liệu kết quả không hợp lệ.");
  const ids = new Set<string>();
  for (const card of value.items) {
    readCardBase(card, card.id);
    if (ids.has(card.id) || !["ACTIVE", "ARCHIVED"].includes(card.status) || typeof card.isOverdue !== "boolean" || !Number.isFinite(Date.parse(card.createdAt)) ||
      !card.list || card.list.id !== card.listId || typeof card.list.name !== "string" || typeof card.list.status !== "string" ||
      !card.list.board || !card.list.board.id || (boardId && card.list.board.id !== boardId) || typeof card.list.board.name !== "string" ||
      typeof card.list.board.status !== "string" || !card.list.board.projectId || typeof card.list.board.project?.status !== "string" ||
      !Array.isArray(card.cardMembers) || card.cardMembers.some((member) => !member.userId || member.user?.id !== member.userId || typeof member.user.name !== "string" || !(member.user.avatar === null || typeof member.user.avatar === "string")) ||
      !Array.isArray(card.cardLabels) || card.cardLabels.some(({ label }) => !label?.id || typeof label.name !== "string" || typeof label.color !== "string")) throw new Error("Dữ liệu quan hệ kết quả không hợp lệ.");
    ids.add(card.id);
  }
  return value;
}

export async function searchTasks(filters: TaskFilters, boardId: string | undefined, cursor: string | null, signal: AbortSignal) {
  const params = taskParams(filters);
  params.set("limit", "20");
  if (cursor) params.set("cursor", cursor);
  return readTaskPage((await apiClient.get<TaskPage>(`${boardId ? `/boards/${boardId}/cards` : "/users/me/cards"}?${params}`, { signal })).data, boardId);
}
