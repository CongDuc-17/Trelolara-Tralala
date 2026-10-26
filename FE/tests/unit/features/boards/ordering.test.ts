import { expect, it } from "vitest";
import { neighbors, ordered } from "@/features/boards/ordering";


const rows = ["a", "b", "c", "d"].map((id, index) => ({ id, position: index * 100 }));
it.each([
  ["d", "a", "top", undefined, "a"], ["a", "d", "bottom", "d", undefined],
  ["a", "c", "top", "b", "c"], ["d", "b", "bottom", "b", "c"],
  ["outside", "b", "top", "a", "b"], ["a", undefined, "bottom", "d", undefined],
] as const)("computes destination neighbors for %s over %s %s", (id, target, direction, before, after) => {
  expect(neighbors(rows, id, target, direction)).toEqual({ before, after });
  expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
});
it("appends to an empty destination without a neighbor from another list", () => {
  expect(neighbors([], "source-card")).toEqual({ before: undefined, after: undefined });
});
it.each(["a", "missing"])("rejects a self or stale destination %s", (target) => {
  expect(() => neighbors(rows, "a", target)).toThrow();
});
it("sorts by server position and id without mutating its input", () => {
  const input = [{ id: "b", position: 1 }, { id: "c", position: -5 }, { id: "a", position: 1 }];
  expect(ordered(input).map((row) => row.id)).toEqual(["c", "a", "b"]);
  expect(input[0].id).toBe("b");
});
