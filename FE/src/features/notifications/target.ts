import { isRecord, type Notification } from "./types";

export function notificationTarget(notification: Notification): string | null {
  const { entityId, entityType, metadata, type } = notification;
  if (!entityId) return null;
  const invitation = type === "PROJECT_INVITED" && entityType === "PROJECT" ? "projects" : type === "BOARD_INVITED" && entityType === "BOARD" ? "boards" : null;
  if (invitation && isRecord(metadata) && typeof metadata.token === "string" && metadata.token.length > 0 && metadata.token.length <= 512) return `/invite/${invitation}/${encodeURIComponent(metadata.token)}`;
  const id = encodeURIComponent(entityId);
  if (entityType === "BOARD") return `/boards/${id}`;
  if (entityType === "PROJECT") return `/projects/${id}`;
  if (entityType === "CARD" && isRecord(metadata) && typeof metadata.boardId === "string" && metadata.boardId) return `/boards/${encodeURIComponent(metadata.boardId)}/cards/${id}`;
  return null;
}
