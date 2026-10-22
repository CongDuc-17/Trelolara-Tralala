import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiClient, getSessionVersion, type ApiEnvelope } from "@/lib/apiClient";
import { useSession } from "@/features/auth/session-context";
import type { Board, BoardDetails, BoardLabel, BoardMember, Member, MemberScope, Project, ProjectMember, Role } from "./types";

function useScope() {
  const { user } = useSession();
  return ["catalog", getSessionVersion(), user?.id] as const;
}

function nextPage<T>(page: ApiEnvelope<T[]>) {
  const pagination = page.pagination;
  return pagination && pagination.currentPage < pagination.totalPages ? pagination.currentPage + 1 : undefined;
}

export function pageItems<T>(data?: InfiniteData<ApiEnvelope<T[]>>) {
  return data?.pages.flatMap((page) => page.data) ?? [];
}

async function getPage<T>(url: string, page: number, signal: AbortSignal) {
  const result = await apiClient.get<T[]>(url, { params: { page, limit: 10 }, signal });
  const pagination = result.pagination;
  if (!Array.isArray(result.data) || !pagination || pagination.currentPage !== page ||
    !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0 ||
    !Number.isInteger(pagination.totalItems) || pagination.totalItems < 0) {
    throw new Error("Phản hồi danh sách/phân trang không hợp lệ.");
  }
  return result;
}

function usePages<T>(key: string[], url: string, enabled = true) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: [...scope, ...key], enabled: enabled && !!scope[2],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => getPage<T>(url, pageParam, signal),
    getNextPageParam: nextPage<T>,
  });
}

export function useProjects() { return usePages<Project>(["projects"], "/projects"); }
export function useUserBoards() { return usePages<Board>(["boards"], "/boards"); }
export function useProjectBoards(id: string, enabled = true) {
  return usePages<Board>(["projects", id, "boards"], `/projects/${id}/boards`, enabled && !!id);
}
export function useProject(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "projects", id], enabled: !!id && !!scope[2],
    queryFn: async ({ signal }) => (await apiClient.get<Project>(`/projects/${id}`, { signal })).data
  });
}
export function useBoard(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "boards", id], enabled: !!id && !!scope[2],
    queryFn: async ({ signal }) => (await apiClient.get<BoardDetails>(`/boards/${id}`, { signal })).data
  });
}
export function useBoardLabels(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "boards", id, "labels"], enabled: !!id && !!scope[2],
    queryFn: async ({ signal }) => (await apiClient.get<BoardLabel[]>(`/boards/${id}/labels`, { signal })).data
  });
}

export function useMembers(kind: MemberScope, id: string, enabled: boolean) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: [...scope, kind, id, "members"], enabled: enabled && !!id && !!scope[2],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<ApiEnvelope<Member[]>> => {
      if (kind === "projects") {
        const page = await getPage<ProjectMember>(`/projects/${id}/members`, pageParam, signal);
        return { ...page, data: page.data.map(({ id, ...member }) => ({ ...member, userId: id })) };
      }
      const page = await apiClient.get<BoardMember[]>(`/boards/${id}/members`, { signal });
      if (!Array.isArray(page.data)) throw new Error("Phản hồi thành viên không hợp lệ.");
      return page;
    },
    getNextPageParam: nextPage<Member>,
  });
}

export function useRoles(kind: MemberScope, enabled: boolean) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "roles"], enabled: enabled && !!scope[2],
    queryFn: async ({ signal }) => (await apiClient.get<Role[]>("/roles", { signal })).data,
    // BE defines role scope by prefix; names do not describe the actor's effective permissions.
    select: (roles) => roles.filter((role) => role.status === "ACTIVE" && role.name.startsWith(kind === "projects" ? "PROJECT_" : "BOARD_")),
  });
}

export function useInvalidateCatalog() {
  const client = useQueryClient();
  const scope = useScope();
  return () => scope[1] === getSessionVersion() ? client.invalidateQueries({ queryKey: scope }) : Promise.resolve();
}

export function useCreateProject() {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: { name: string; description?: string; }) => apiClient.post<Project>("/projects", input), onSuccess: invalidate });
}
export function useCreateBoard(projectId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: { name: string; description?: string; }) => apiClient.post<BoardDetails>(`/projects/${projectId}/boards`, input), onSuccess: invalidate });
}
