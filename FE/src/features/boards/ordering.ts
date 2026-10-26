export function ordered<T extends { id: string; position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function neighbors<T extends { id: string }>(items: T[], movedId: string, targetId?: string, direction: "top" | "bottom" = "bottom") {
  const siblings = items.filter((item) => item.id !== movedId);
  const target = targetId === undefined ? siblings.length : siblings.findIndex((item) => item.id === targetId);
  if (target < 0 || targetId === movedId) throw new Error("Vị trí đích không còn hợp lệ. Hãy tải lại bảng.");
  const index = targetId === undefined || direction === "top" ? target : target + 1;
  return { before: siblings[index - 1]?.id, after: siblings[index]?.id };
}

