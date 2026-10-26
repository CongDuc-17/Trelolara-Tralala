import type { CardSummary } from "@/features/cards/types";
import type { List } from "./types";
import { neighbors, ordered } from "./ordering";

export type BoardState = { lists: List[]; cards: Record<string, CardSummary[]> };
export type MoveIntent = { kind: "card" | "list"; id: string; listId?: string; targetId?: string; direction?: "top" | "bottom" };

function insert<T extends { id: string; position: number }>(items: T[], item: T, intent: MoveIntent) {
  const rest = items.filter((other) => other.id !== item.id);
  const adjacent = neighbors(items, item.id, intent.targetId, intent.direction);
  const index = adjacent.after ? rest.findIndex((other) => other.id === adjacent.after) : rest.length;
  return [...rest.slice(0, index), item, ...rest.slice(index)].map((other, index) => ({ ...other, position: (index + 1) * 1024 }));
}

export function projectMove(state: BoardState, intent: MoveIntent): BoardState {
  if (intent.id === intent.targetId) return state;
  if (intent.kind === "list") {
    const active = state.lists.filter((list) => list.status === "ACTIVE");
    const item = active.find((list) => list.id === intent.id);
    if (!item || (intent.targetId && !active.some((list) => list.id === intent.targetId))) return state;
    return { ...state, lists: [...insert(active, item, intent), ...state.lists.filter((list) => list.status !== "ACTIVE")] };
  }
  const item = Object.values(state.cards).flat().find((card) => card.id === intent.id && card.status === "ACTIVE");
  const destination = intent.listId && state.cards[intent.listId];
  if (!item || !destination || !state.lists.some((list) => list.id === intent.listId && list.status === "ACTIVE") ||
    (intent.targetId && !destination.some((card) => card.id === intent.targetId && card.status === "ACTIVE"))) return state;
  const cards = { ...state.cards, [item.listId]: state.cards[item.listId].filter((card) => card.id !== item.id) };
  cards[intent.listId!] = [...insert(destination.filter((card) => card.status === "ACTIVE"), { ...item, listId: intent.listId! }, intent), ...destination.filter((card) => card.status !== "ACTIVE")];
  return { ...state, cards };
}

export function sameOrder(a: BoardState, b: BoardState) {
  const signature = (state: BoardState) => [state.lists.filter((list) => list.status === "ACTIVE").map((list) => list.id),
    Object.keys(state.cards).sort().map((id) => [id, ordered(state.cards[id]).filter((card) => card.status === "ACTIVE").map((card) => card.id)])];
  return JSON.stringify(signature(a)) === JSON.stringify(signature(b));
}
