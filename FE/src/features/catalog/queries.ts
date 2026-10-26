import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getSessionVersion, type ApiEnvelope } from "@/lib/apiClient";
import { useSession } from "@/features/auth/session-context";
import * as api from "./api";
import { refreshTaskQueries } from "@/features/discovery/cache";
import type { CatalogLifecycleInput, ChangeMemberRoleInput, CreateCatalogInput, InvitationAction, InviteMemberInput, Member, MemberScope, RemoveMemberInput, UpdateCatalogInput } from "./types";

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

function usePages<T>(key: string[], fetchPage: (page: number, signal: AbortSignal) => Promise<ApiEnvelope<T[]>>, enabled = true) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: [...scope, ...key], enabled: enabled && !!scope[2],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    getNextPageParam: nextPage<T>,
  });
}

export function useProjects() { return usePages(["projects"], api.getProjects); }
export function useUserBoards() { return usePages(["boards"], api.getUserBoards); }
export function useProjectBoards(id: string, enabled = true) {
  return usePages(["projects", id, "boards"], (page, signal) => api.getProjectBoards(id, page, signal), enabled && !!id);
}
export function useProject(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "projects", id], enabled: !!id && !!scope[2],
    queryFn: ({ signal }) => api.getProject(id, signal),
  });
}
export function useBoard(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "boards", id], enabled: !!id && !!scope[2],
    queryFn: ({ signal }) => api.getBoard(id, signal),
  });
}
export function useBoardLabels(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "boards", id, "labels"], enabled: !!id && !!scope[2],
    queryFn: ({ signal }) => api.getBoardLabels(id, signal),
  });
}

export function useMembers(kind: MemberScope, id: string, enabled: boolean) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: [...scope, kind, id, "members"], enabled: enabled && !!id && !!scope[2],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.getMembers(kind, id, pageParam, signal),
    getNextPageParam: nextPage<Member>,
  });
}

export function useRoles(kind: MemberScope, enabled: boolean) {
  const scope = useScope();
  return useQuery({
    queryKey: [...scope, "roles"], enabled: enabled && !!scope[2],
    queryFn: ({ signal }) => api.getRoles(signal),
    // BE defines role scope by prefix; names do not describe the actor's effective permissions.
    select: (roles) => roles.filter((role) => role.status === "ACTIVE" && role.name.startsWith(kind === "projects" ? "PROJECT_" : "BOARD_")),
  });
}

export function useInvalidateCatalog() {
  const client = useQueryClient();
  const scope = useScope();
  return () => scope[1] === getSessionVersion() ? Promise.all([
    client.invalidateQueries({ queryKey: scope }),
    refreshTaskQueries(client, ["discovery", scope[1], scope[2]]),
  ]) : Promise.resolve();
}

export function useCreateProject() {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: CreateCatalogInput) => api.createProject(input), onSuccess: invalidate });
}
export function useCreateBoard(projectId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: CreateCatalogInput) => api.createBoard(projectId, input), onSuccess: invalidate });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: UpdateCatalogInput) => api.updateProject(id, input), onSuccess: invalidate });
}
export function useUpdateBoard(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: UpdateCatalogInput) => api.updateBoard(id, input), onSuccess: invalidate });
}
export function useChangeCatalogLifecycle() {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: CatalogLifecycleInput) => api.changeCatalogLifecycle(input), onSuccess: invalidate });
}
export function useUploadBoardBackground(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal; }) => api.uploadBoardBackground(id, file, signal),
    onSuccess: invalidate,
  });
}
export function useChangeMemberRole(kind: MemberScope, id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: ChangeMemberRoleInput) => api.changeMemberRole(kind, id, input), onSuccess: invalidate });
}
export function useRemoveMember(kind: MemberScope, id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (input: RemoveMemberInput) => api.removeMember(kind, id, input), onSuccess: invalidate });
}
export function useInviteMember(kind: MemberScope, id: string) {
  return useMutation({ mutationFn: (input: InviteMemberInput) => api.inviteMember(kind, id, input) });
}
export function useRespondToInvitation(token: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (action: InvitationAction) => api.respondToInvitation(token, action), onSuccess: invalidate });
}
