import { expect, it } from "vitest";
import { testCard } from "../../../support/fixtures";
import { readCardBase, readCardDetail, readCardList } from "@/features/cards/adapters";
import type { CardListDto } from "@/features/cards/types";

it.each([null, 60, 1440] as const)("preserves nullable deadlines, false completion and reminder preference %s in both read projections", (reminderMinutesBefore) => {
  const raw = { ...testCard, dueDate: null, isComplete: false, isOverdue: false, reminderMinutesBefore };
  const row: CardListDto = { ...raw, status: "ACTIVE", cardMembers: [], cardLabels: [], checklists: [], _count: { comments: 0 } };
  const expected = { dueDate: null, isComplete: false, isOverdue: false, reminderMinutesBefore };
  expect(readCardDetail(raw, raw.id)).toMatchObject(expected);
  expect(readCardList([row], row.listId)[0]).toMatchObject(expected);
});

it.each(["2026-10-23T10:00:00.000Z", "2026-10-23T17:00:00+07:00"])("preserves a deadline with an explicit timezone: %s", (dueDate) => {
  expect(readCardBase({ ...testCard, dueDate }, testCard.id).dueDate).toBe(dueDate);
});

it.each([
  { dueDate: undefined }, { dueDate: "not-a-date" }, { dueDate: "2026-10-23T17:00:00" },
  { isComplete: undefined }, { isComplete: "false" },
  { reminderMinutesBefore: undefined }, { reminderMinutesBefore: 0 }, { reminderMinutesBefore: 30 },
])("rejects malformed or missing persisted metadata instead of coercing it: %j", (invalid) => {
  const raw = structuredClone(testCard);
  Object.assign(raw, invalid);
  expect(() => readCardBase(raw, raw.id)).toThrow("Dữ liệu thẻ không hợp lệ");
});

it("rejects a mismatched card and a missing overdue projection", () => {
  expect(() => readCardBase(testCard, "another-card")).toThrow("không khớp");
  const raw = structuredClone(testCard);
  Object.assign(raw, { isOverdue: undefined });
  expect(() => readCardDetail(raw, raw.id)).toThrow();
});
