import type { TaskFilters } from "./types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = ["keyword", "memberIds", "labelIds", "isComplete", "due", "status"] as const;

export function readTaskFilters(params: URLSearchParams, board: boolean): TaskFilters {
  const filters: TaskFilters = {};
  for (const key of fields) {
    const values = params.getAll(key);
    if (values.length > 1) throw new Error("duplicate");
    const value = values[0];
    if (value === undefined) continue;
    if (key === "keyword") {
      const keyword = value.trim();
      if (keyword.length > 100) throw new Error(key);
      if (keyword) filters.keyword = keyword;
    } else if (key === "memberIds" || key === "labelIds") {
      const ids = value.split(",");
      if (ids.length > 50 || ids.some((id) => !uuid.test(id))) throw new Error(key);
      filters[key] = [...new Set(ids)].sort();
    } else if (key === "isComplete") {
      if (!["true", "false"].includes(value)) throw new Error(key);
      filters.isComplete = value === "true";
    } else if (key === "due") {
      if (!["overdue", "soon", "none"].includes(value)) throw new Error(key);
      filters.due = value as TaskFilters["due"];
    } else {
      if (!board || !["ACTIVE", "ARCHIVED", "ALL"].includes(value)) throw new Error(key);
      filters.status = value as TaskFilters["status"];
    }
  }
  return filters;
}

export function taskParams(filters: TaskFilters) {
  const params = new URLSearchParams();
  for (const key of fields) {
    const value = filters[key];
    if (value !== undefined) params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params;
}

export function taskCardPath(base: string, boardId: string, cardId: string, search: string) {
  return `${base}${base === "/my-work" ? `/boards/${boardId}` : ""}/cards/${cardId}${search}`;
}

export function cardReturnPath(pathname: string, search: string, boardId: string) {
  if (pathname.startsWith(`/my-work/boards/${boardId}/cards/`)) return `/my-work${search}`;
  if (pathname.startsWith(`/boards/${boardId}/search/cards/`)) return `/boards/${boardId}/search${search}`;
  return `/boards/${boardId}`;
}
