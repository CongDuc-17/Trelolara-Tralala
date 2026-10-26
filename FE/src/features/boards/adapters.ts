import type { List } from "./types";

export function readLists(value: List[], boardId: string) {
  if (!Array.isArray(value) || value.some((list) => !list || typeof list.id !== "string" ||
    list.boardId !== boardId || typeof list.name !== "string" || !Number.isFinite(list.position) ||
    !["ACTIVE", "ARCHIVED"].includes(list.status))) throw new Error("Dữ liệu danh sách không hợp lệ.");
  return value;
}
