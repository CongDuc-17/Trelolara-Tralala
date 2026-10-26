import { expect, it } from "vitest";
import { cardReturnPath, readTaskFilters, taskCardPath, taskParams } from "@/features/discovery/filters";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
it("keeps explicit false, trims blank keywords, deduplicates groups and preserves AND/OR parameters", () => {
  const filters = readTaskFilters(new URLSearchParams(`keyword=  &isComplete=false&memberIds=${id(2)},${id(1)},${id(2)}&labelIds=${id(3)}&due=soon&status=ALL`), true);
  expect(filters).toEqual({ isComplete: false, memberIds: [id(1), id(2)], labelIds: [id(3)], due: "soon", status: "ALL" });
  expect(readTaskFilters(taskParams(filters), true)).toEqual(filters);
});
it("accepts at most 50 UUIDs per group, before deduplication", () => {
  expect(readTaskFilters(new URLSearchParams({ memberIds: Array.from({ length: 50 }, (_, n) => id(n)).join(",") }), false).memberIds).toHaveLength(50);
  expect(() => readTaskFilters(new URLSearchParams({ labelIds: Array(51).fill(id(1)).join(",") }), true)).toThrow();
});
it.each(["isComplete=0", "isComplete=False", "due=today", "memberIds=", "memberIds=hello", "labelIds=not-a-uuid", "status=DELETED", "due=soon&due=none", "keyword=" + "a".repeat(101)])("rejects invalid filters: %s", (search) => {
  expect(() => readTaskFilters(new URLSearchParams(search), true)).toThrow();
});
it("never sends board status, actor or unrelated URL parameters to My work", () => {
  expect(() => readTaskFilters(new URLSearchParams("status=ACTIVE"), false)).toThrow();
  expect(taskParams(readTaskFilters(new URLSearchParams("actor=someone&cursor=bad&returnTo=https://evil.test&keyword=test"), false)).toString()).toBe("keyword=test");
});
it("keeps filters in nested card links and returns only to fixed internal routes", () => {
  const path = taskCardPath("/my-work", id(1), id(2), "?due=soon&isComplete=false");
  expect(cardReturnPath(path.split("?")[0], "?due=soon&isComplete=false", id(1))).toBe("/my-work?due=soon&isComplete=false");
  const board = taskCardPath(`/boards/${id(1)}/search`, id(1), id(2), "?status=ALL");
  expect(cardReturnPath(board.split("?")[0], "?status=ALL", id(1))).toBe(`/boards/${id(1)}/search?status=ALL`);
  expect(cardReturnPath("https://evil.test", "?returnTo=https://evil.test", id(1))).toBe(`/boards/${id(1)}`);
});
