import type { CardBase, UpdateCardInput } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
export function localDeadline(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function deadlineInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || localDeadline(date.toISOString()) !== value) throw new Error("invalidDate");
  return date.toISOString();
}
export function deadlineState(card: Pick<CardBase, "dueDate" | "isComplete">, now: number) {
  if (card.isComplete) return "complete";
  if (!card.dueDate) return "none";
  const due = Date.parse(card.dueDate);
  return due < now ? "overdue" : due <= now + 86_400_000 ? "soon" : "scheduled";
}
export function metadataInput(card: CardBase, draft: { dueDate?: string; reminderMinutesBefore?: CardBase["reminderMinutesBefore"] }): UpdateCardInput {
  const input: UpdateCardInput = {};
  if (draft.dueDate !== undefined) input.dueDate = deadlineInput(draft.dueDate);
  if (draft.reminderMinutesBefore !== undefined) {
    if (draft.reminderMinutesBefore !== null && !(input.dueDate === undefined ? card.dueDate : input.dueDate)) throw new Error("needsDate");
    input.reminderMinutesBefore = draft.reminderMinutesBefore;
  }
  return input;
}
