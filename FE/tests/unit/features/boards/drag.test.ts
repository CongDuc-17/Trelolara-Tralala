import { expect, it } from "vitest";
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { boardKeyboardCoordinates } from "@/features/boards/drag";

type Coordinates = Parameters<KeyboardCoordinateGetter>[1];
const box = (left: number, top: number, width = 302, height = 100) => ({ left, top, width, height, right: left + width, bottom: top + height });
function fixture(listId = "a", overId = "card:1", x = 8, y = 0): Coordinates {
  const nodes = [
    { id: "card:1", data: { current: { kind: "card", listId } } },
    { id: "card:2", data: { current: { kind: "card", listId: "a" } } },
    ...["a", "b", "c"].map((id) => ({ id: `cards:${id}`, data: { current: { kind: "container", listId: id } } })),
  ];
  const rects = new Map([["card:1", box(8, 0)], ["card:2", box(8, 110)], ["cards:a", box(0, 0, 318, 250)], ["cards:b", box(336, 0, 318, 250)], ["cards:c", box(672, 0, 318, 60)]]);
  // Only geometry fields consumed by the keyboard sensor are needed in this fixture.
  return { currentCoordinates: { x, y }, context: { active: { id: "card:1", data: { current: { kind: "card", listId } } }, over: nodes.find((node) => node.id === overId),
    collisionRect: box(x, y), droppableRects: rects, droppableContainers: { getEnabled: () => nodes } } } as unknown as Coordinates;
}
it("moves to the next card instead of choosing its own current target", () => {
  expect(boardKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowDown" }), fixture())).toEqual({ x: 8, y: 110 });
});
it("moves onward from an occupied column to an empty one without choosing the current column again", () => {
  const args = fixture("b", "card:1", 336, 0);
  expect(boardKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowRight" }), args)).toEqual({ x: 672, y: 0 });
});
it("allows the opposite arrow to return to the original card position", () => {
  expect(boardKeyboardCoordinates(new KeyboardEvent("keydown", { code: "ArrowUp" }), fixture("a", "card:2", 8, 110))).toEqual({ x: 8, y: 0 });
});
