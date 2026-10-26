import { expect, it } from "vitest";
import { testCard } from "../../../support/fixtures";
import { deadlineInput, deadlineState, localDeadline, metadataInput } from "@/features/cards/deadline";

it("converts local device time to an ISO instant and round-trips minutes", () => {
  const local = "2026-10-23T17:30";
  expect(deadlineInput(local)).toBe(new Date(2026, 9, 23, 17, 30).toISOString());
  expect(localDeadline(deadlineInput(local))).toBe(local);
  expect(deadlineInput("")).toBeNull();
});
it.each(["2026-02-30T10:00", "2026-15-01T10:00", "2026-10-23", "2026-10-23T10:00Z", "bad", "2026-10-23T10:00:30"])('rejects invalid local time %s', (value) => expect(() => deadlineInput(value)).toThrow());
it("keeps the overdue boundary strict, soon inclusive, and completion independent of due date", () => {
  const now = Date.parse("2026-10-23T10:00:00Z");
  const card = { ...testCard, dueDate: new Date(now).toISOString() };
  expect(deadlineState(card, now)).toBe("soon");
  expect(deadlineState(card, now + 1)).toBe("overdue");
  expect(deadlineState({ ...card, dueDate: new Date(now + 86400000).toISOString() }, now)).toBe("soon");
  expect(deadlineState({ ...card, dueDate: new Date(now + 86400001).toISOString() }, now)).toBe("scheduled");
  expect(deadlineState({ ...card, isComplete: true }, now + 1)).toBe("complete");
  expect(deadlineState(testCard, now)).toBe("none");
});
it("omits unchanged fields and keeps seconds/offset when saving only a reminder", () => {
  const card = { ...testCard, dueDate: "2026-10-23T17:30:12+07:00" };
  expect(metadataInput(card, { reminderMinutesBefore: 1440 })).toEqual({ reminderMinutesBefore: 1440 });
  expect(metadataInput(card, {})).toEqual({});
});
it("clears only the deadline, preserving completion and the existing reminder preference", () => {
  expect(metadataInput({ ...testCard, isComplete: true, dueDate: "2026-10-23T10:00:00Z", reminderMinutesBefore: 60 }, { dueDate: "" })).toEqual({ dueDate: null });
});
it("requires an effective due date to enable, accepts date+reminder together and explicit null to disable", () => {
  expect(() => metadataInput(testCard, { reminderMinutesBefore: 60 })).toThrow("needsDate");
  expect(metadataInput(testCard, { reminderMinutesBefore: null })).toEqual({ reminderMinutesBefore: null });
  expect(metadataInput(testCard, { dueDate: "2026-10-23T10:00", reminderMinutesBefore: 60 })).toEqual({ dueDate: deadlineInput("2026-10-23T10:00"), reminderMinutesBefore: 60 });
});
