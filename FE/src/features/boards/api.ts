import { apiClient } from "@/lib/apiClient";
import type { List, MoveListInput } from "./types";

export async function getBoardLists(boardId: string, signal?: AbortSignal) {
  return (await apiClient.get<List[]>(`/boards/${boardId}/lists`, { signal })).data;
}
export async function createList(boardId: string, name: string) {
  return (await apiClient.post<List>(`/boards/${boardId}/lists`, { name })).data;
}
export async function renameList(id: string, name: string) {
  return (await apiClient.patch<List>(`/lists/${id}/update`, { name })).data;
}
export async function moveList(id: string, input: MoveListInput) {
  return (await apiClient.patch<List>(`/lists/${id}/move`, input)).data;
}
export function changeListLifecycle(id: string, action: "archive" | "restore" | "delete") {
  return action === "delete" ? apiClient.delete<null>(`/lists/${id}`) : apiClient.patch<List>(`/lists/${id}/${action}`);
}
