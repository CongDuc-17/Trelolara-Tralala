import { apiClient } from "@/lib/apiClient";
import type { CardBase, CardDetailDto, CardListDto, CardRow, Checklist, ChecklistItemDto, CommentDto, Label, LabelInput, MoveCardInput, UpdateCardInput } from "./types";

export async function getCard(id: string, signal?: AbortSignal) {
  return (await apiClient.get<CardBase>(`/cards/${id}`, { signal })).data;
}
export async function getCardDetail(id: string, signal?: AbortSignal) {
  return (await apiClient.get<CardDetailDto>(`/cards/${id}?include=members,labels,checklists,comments`, { signal })).data;
}
export async function getListCards(listId: string, signal?: AbortSignal) {
  return (await apiClient.get<CardListDto[]>(`/lists/${listId}/cards`, { signal })).data;
}
export async function createCard(listId: string, title: string) {
  return (await apiClient.post<CardRow>(`/lists/${listId}/cards`, { title })).data;
}
export async function updateCard(id: string, input: UpdateCardInput) {
  return (await apiClient.patch<CardRow>(`/cards/${id}`, input)).data;
}
export async function moveCard(id: string, input: MoveCardInput) {
  return (await apiClient.patch<CardRow>(`/cards/${id}/move`, input)).data;
}
export function changeCardLifecycle(id: string, action: "archive" | "restore" | "delete") {
  return action === "delete" ? apiClient.delete<CardRow>(`/cards/${id}`) : apiClient.patch<CardRow>(`/cards/${id}/${action}`);
}
export async function createChecklist(cardId: string, title: string) {
  return (await apiClient.post<Pick<Checklist, "id" | "title"> & { cardId: string }>(`/cards/${cardId}/checklists`, { title })).data;
}
export async function createChecklistItem(checklistId: string, title: string) {
  return (await apiClient.post<ChecklistItemDto>(`/checklists/${checklistId}`, { title })).data;
}
export async function setChecklistItemCompletion(id: string, completed: boolean) {
  return (await apiClient.patch<ChecklistItemDto>(`/checklist-items/${id}`, { completed })).data;
}
export function deleteChecklist(id: string) { return apiClient.delete<null>(`/checklists/${id}`); }
export async function createComment(cardId: string, content: string) {
  return (await apiClient.post<CommentDto>(`/cards/${cardId}/comments`, { content })).data;
}
export async function updateComment(id: string, content: string) {
  return (await apiClient.patch<CommentDto>(`/comments/${id}`, { content })).data;
}
export function attachCardLabel(cardId: string, labelId: string) {
  return apiClient.post<{ id: string; cardId: string; labelId: string }>(`/cards/${cardId}/labels`, { labelId });
}
export function detachCardLabel(cardId: string, labelId: string) {
  return apiClient.delete<null>(`/cards/${cardId}/labels/${labelId}`);
}
export async function createBoardLabel(boardId: string, input: LabelInput) {
  return (await apiClient.post<Label>(`/boards/${boardId}/labels`, input)).data;
}
export async function updateBoardLabel(id: string, input: LabelInput) {
  return (await apiClient.patch<Label>(`/labels/${id}`, input)).data;
}
export function addCardMember(cardId: string, userId: string) {
  return apiClient.post<{ id: string; cardId: string; userId: string }>(`/cards/${cardId}/members`, { userId });
}
export function removeCardMember(cardId: string, userId: string) {
  return apiClient.delete<null>(`/cards/${cardId}/members/${userId}`);
}
