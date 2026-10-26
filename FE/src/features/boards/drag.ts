import { useSyncExternalStore } from "react";
import { closestCenter, pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter } from "@dnd-kit/core";
export const listDragId = (id: string) => `list:${id}`;
export const cardDragId = (id: string) => `card:${id}`;
export const listDropId = (id: string) => `cards:${id}`;
export const ARCHIVE_DROP_ID = "archive";
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => { const media = matchMedia(motionQuery); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); };

export function useReducedBoardMotion() {
  return useSyncExternalStore(subscribeMotion, () => matchMedia(motionQuery).matches, () => false);
}

export const boardCollision: CollisionDetection = (args) => {
  const kind = args.active.data.current?.kind;
  const candidates = args.droppableContainers.filter((container) => container.id === ARCHIVE_DROP_ID ||
    (kind === "list" ? container.data.current?.kind === "list" : ["card", "container"].includes(container.data.current?.kind)));
  const pointer = pointerWithin({ ...args, droppableContainers: candidates });
  const archive = pointer.find((hit) => hit.id === ARCHIVE_DROP_ID);
  if (archive) return [archive];
  if (args.pointerCoordinates) {
    const cards = pointer.filter((hit) => String(hit.id).startsWith("card:"));
    return cards.length ? cards.slice(0, 1) : pointer.slice(0, 1);
  }
  return closestCenter({ ...args, droppableContainers: candidates.filter((container) => container.id !== ARCHIVE_DROP_ID &&
    (kind !== "card" || container.data.current?.kind !== "container" || !candidates.some((card) => card.data.current?.kind === "card" && card.data.current?.listId === container.data.current?.listId && card.id !== args.active.id))) });
};

export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code) || !context.active || !context.collisionRect) return;
  event.preventDefault();
  const active = context.active;
  const rect = context.collisionRect;
  const horizontal = ["ArrowLeft", "ArrowRight"].includes(event.code);
  const positive = ["ArrowRight", "ArrowDown"].includes(event.code);
  const listId = context.over?.data.current?.listId ?? active.data.current?.listId;
  const column = listId ? context.droppableRects.get(listDropId(listId)) : undefined;
  const centerX = column ? column.left + column.width / 2 : currentCoordinates.x + rect.width / 2;
  const candidates = context.droppableContainers.getEnabled().flatMap((node) => {
    const box = context.droppableRects.get(node.id);
    if (!box || node.id === ARCHIVE_DROP_ID || node.id === context.over?.id) return [];
    const kind = node.data.current?.kind;
    if (active.data.current?.kind === "list" ? kind !== "list" || !horizontal : horizontal ? kind !== "container" || node.data.current?.listId === listId : kind !== "card" || node.data.current?.listId !== listId) return [];
    const delta = horizontal ? box.left + box.width / 2 - centerX : box.top - currentCoordinates.y;
    return (positive ? delta > 1 : delta < -1) ? [{ box, distance: Math.abs(delta) }] : [];
  }).sort((a, b) => a.distance - b.distance);
  const next = candidates[0]?.box;
  if (!next) return;
  return { x: next.left, y: horizontal ? Math.max(next.top, Math.min(currentCoordinates.y, next.bottom - Math.min(rect.height, next.height))) : next.top };
};
