import { isRecord } from "@/features/notifications/types";

export type BoardEvent = { event: "board:subscribed" | "board:changed"; data: { boardId: string; revision: string } } |
  { event: "board:unsubscribed"; data: { boardId: string; reason?: "forbidden" } };

export function readBoardEvent(raw: unknown, boardId: string): BoardEvent | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.data) || value.data.boardId !== boardId) return null;
    if ((value.event === "board:subscribed" || value.event === "board:changed") && typeof value.data.revision === "string" && /^(0|[1-9]\d{0,19})$/.test(value.data.revision)) return { event: value.event, data: { boardId, revision: value.data.revision } };
    if (value.event === "board:unsubscribed" && (value.data.reason === undefined || value.data.reason === "forbidden")) return { event: value.event, data: { boardId, reason: value.data.reason } };
  } catch { /* Ignore malformed or unrelated frames. */ }
  return null;
}

export function newerRevision(next: string, current: string | null) {
  return current === null || BigInt(next) > BigInt(current);
}
