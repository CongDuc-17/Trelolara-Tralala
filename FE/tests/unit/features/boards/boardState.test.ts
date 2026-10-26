import { expect, it } from "vitest";
import { projectMove, sameOrder, type BoardState } from "@/features/boards/boardState";
import type { CardSummary } from "@/features/cards/types";
import { newerRevision, readBoardEvent } from "@/features/boards/realtime";

const card = (id: string, listId: string, position: number): CardSummary => ({ id, listId, position, title: id, description: null, status: "ACTIVE", dueDate: null, isComplete: false, reminderMinutesBefore: null, isOverdue: false, labels: [], members: [], checklists: [], attachmentCount: 0, commentCount: 0 });
function state(): BoardState { return { lists: [{ id: "a", boardId: "b", name: "A", position: 1, status: "ACTIVE" }, { id: "b", boardId: "b", name: "B", position: 2, status: "ACTIVE" }, { id: "empty", boardId: "b", name: "Empty", position: 3, status: "ACTIVE" }], cards: { a: [card("1", "a", 1), card("2", "a", 2)], b: [card("3", "b", 1)], empty: [] } }; }

it.each(["top", "bottom"] as const)("projects a move %s a destination card without mutating its source", (direction) => {
  const base = state(); const result = projectMove(base, { kind: "card", id: "1", listId: "b", targetId: "3", direction });
  expect(result.cards.a.map((card) => card.id)).toEqual(["2"]);
  expect(result.cards.b.map((card) => card.id)).toEqual(direction === "top" ? ["1", "3"] : ["3", "1"]);
  expect(result.cards.b.find((card) => card.id === "1")?.listId).toBe("b");
  expect(base.cards.a.map((card) => card.id)).toEqual(["1", "2"]);
});
it("projects an empty destination and preserves later intentions when an earlier one is removed", () => {
  const base = state();
  const first = { kind: "card", id: "1", listId: "b" } as const;
  const second = { kind: "card", id: "2", listId: "empty" } as const;
  expect(projectMove(projectMove(base, first), second).cards.empty[0].id).toBe("2");
  const rollback = projectMove(base, second);
  expect(rollback.cards.a.map((card) => card.id)).toEqual(["1"]);
  expect(rollback.cards.empty.map((card) => card.id)).toEqual(["2"]);
});
it("leaves missing, archived and self targets intact", () => {
  const base = state(); base.lists[1].status = "ARCHIVED";
  for (const intent of [{ kind: "card", id: "1", listId: "b" }, { kind: "card", id: "1", listId: "a", targetId: "1" }, { kind: "list", id: "absent", targetId: "a" }] as const) expect(projectMove(base, intent)).toBe(base);
});
it("reorders lists and identifies a canceled preview", () => {
  const base = state();
  expect(sameOrder(base, projectMove(base, { kind: "list", id: "b", targetId: "a", direction: "top" }))).toBe(false);
  expect(sameOrder(base, structuredClone(base))).toBe(true);
});
it("ignores archived positions and card map insertion order when comparing the visible order", () => {
  const base = state(); base.cards.a.push({ ...card("archived", "a", -1), status: "ARCHIVED" });
  const reversed = { ...base, cards: Object.fromEntries(Object.entries(base.cards).reverse()) };
  expect(sameOrder(base, reversed)).toBe(true);
  expect(sameOrder(base, projectMove(base, { kind: "card", id: "2", listId: "a" }))).toBe(true);
});
it("compares revisions beyond Number precision and ignores duplicate or older values", () => {
  expect(newerRevision("9007199254740993", "9007199254740992")).toBe(true);
  expect(newerRevision("10", "9")).toBe(true);
  expect(newerRevision("9", "10")).toBe(false);
  expect(newerRevision("10", "10")).toBe(false);
});
it.each(["{", "null", JSON.stringify({ event: "board:changed", data: { boardId: "other", revision: "1" } }), JSON.stringify({ event: "board:changed", data: { boardId: "b", revision: 1 } }), JSON.stringify({ event: "board:changed", data: { boardId: "b", revision: "1e5" } })])("ignores malformed or unrelated board frame %s", (raw) => expect(readBoardEvent(raw, "b")).toBeNull());
it("reads permission revocation without exposing content", () => expect(readBoardEvent(JSON.stringify({ event: "board:unsubscribed", data: { boardId: "b", reason: "forbidden" } }), "b")).toEqual({ event: "board:unsubscribed", data: { boardId: "b", reason: "forbidden" } }));
