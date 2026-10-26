import { apiClient } from "@/lib/apiClient";
import i18n from "@/app/i18n";
import type { CardActivityPage, CardAttachment, CardBase, CardDetailDto, CardListDto, CardRow, Checklist, ChecklistItemDto, CommentDto, Label, LabelInput, MoveCardInput, UpdateCardInput } from "./types";

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

export async function getAttachments(cardId: string, signal: AbortSignal) {
  const { data, success } = await apiClient.get<CardAttachment[]>(`/cards/${encodeURIComponent(cardId)}/attachments`, { signal });
  if (!success || !Array.isArray(data) || data.some((file) => !file || file.cardId !== cardId || typeof file.id !== "string" || !file.id || typeof file.userId !== "string" || typeof file.fileName !== "string" || !Number.isSafeInteger(file.fileSize) || file.fileSize < 0 || typeof file.createdAt !== "string" || !Number.isFinite(Date.parse(file.createdAt)) || !(file.mimeType === null || typeof file.mimeType === "string") || !(file.downloadUrl === null || typeof file.downloadUrl === "string"))) throw new Error(i18n.t("common.invalidResponse"));
  return data;
}
export async function uploadAttachment(cardId: string, file: File, signal: AbortSignal) {
  const form = new FormData(); form.append("file", file);
  const response = await apiClient.post<CardAttachment>(`/cards/${encodeURIComponent(cardId)}/attachments`, form, { signal });
  if (!response.success || response.data?.cardId !== cardId || typeof response.data.id !== "string") throw new Error(i18n.t("common.invalidResponse"));
  return response;
}
export async function deleteAttachment(cardId: string, id: string) {
  const response = await apiClient.delete<null>(`/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(id)}`);
  if (!response.success || response.data !== null) throw new Error(i18n.t("common.invalidResponse"));
  return response;
}
export async function getAttachmentDownload(cardId: string, id: string) {
  const { data, success } = await apiClient.get<{ url: string; expiresAt: string }>(`/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(id)}/download`);
  if (!success || !data || typeof data.url !== "string" || typeof data.expiresAt !== "string") throw new Error(i18n.t("common.invalidResponse"));
  let url: URL;
  try { url = new URL(data.url); } catch { throw new Error(i18n.t("common.invalidResponse")); }
  if (url.protocol !== "https:" || url.username || url.password || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error(i18n.t("common.invalidResponse"));
  return url.href;
}
export async function getCardActivities(cardId: string, cursor: string | undefined, signal: AbortSignal) {
  const { data, success } = await apiClient.get<CardActivityPage>(`/cards/${encodeURIComponent(cardId)}/activities`, { params: { limit: 20, ...(cursor ? { cursor } : {}) }, signal });
  if (!success || !data || !Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === "string") || data.items.some((event) => !event || event.cardId !== cardId || typeof event.id !== "string" || typeof event.action !== "string" || !event.actor || event.actor.id !== event.userId || typeof event.actor.name !== "string" || !(event.actor.avatar === null || typeof event.actor.avatar === "string") || !(event.details === null || typeof event.details === "string") || typeof event.createdAt !== "string" || !Number.isFinite(Date.parse(event.createdAt)))) throw new Error(i18n.t("common.invalidResponse"));
  return data;
}
export function updateChecklistTitle(id: string, title: string) { return apiClient.patch(`/checklists/${id}`, { title }); }
export function updateChecklistItemTitle(id: string, title: string) { return apiClient.patch(`/checklist-items/${id}`, { title }); }
export function deleteChecklistItem(id: string) { return apiClient.delete(`/checklist-items/${id}`); }
export function deleteBoardLabel(id: string) { return apiClient.delete(`/labels/${id}`); }
