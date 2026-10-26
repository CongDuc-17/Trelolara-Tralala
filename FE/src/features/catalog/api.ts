import { apiClient, type ApiEnvelope } from "@/lib/apiClient";
import i18n from "@/app/i18n";
import type {
  Board, BoardDetails, BoardLabel, BoardMember, CatalogLifecycleInput, ChangeMemberRoleInput,
  CreateCatalogInput, Invitation, InvitationAction, InviteMemberInput, Member, MemberScope,
  Person, Project, ProjectMember, RemoveMemberInput, Role, UpdateCatalogInput,
} from "./types";

async function getPage<T>(url: string, page: number, signal: AbortSignal, filters: Record<string, string> = {}) {
  const result = await apiClient.get<T[]>(url, { params: { page, limit: 10, ...filters }, signal });
  const pagination = result.pagination;
  if (!Array.isArray(result.data) || !pagination || pagination.currentPage !== page ||
    !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0 ||
    !Number.isInteger(pagination.totalItems) || pagination.totalItems < 0) {
    throw new Error("Phản hồi danh sách/phân trang không hợp lệ.");
  }
  return result;
}
export async function getPeople(name: string, page: number, signal: AbortSignal) {
  const result = await getPage<Person>("/users", page, signal, name ? { name } : {});
  if (result.data.some((person) => !person || typeof person.id !== "string" || typeof person.name !== "string" || typeof person.email !== "string" || !(person.avatar === undefined || person.avatar === null || typeof person.avatar === "string"))) throw new Error(i18n.t("common.invalidResponse"));
  return result;
}
export async function getPerson(id: string, signal: AbortSignal) {
  const { data } = await apiClient.get<Person>(`/users/${encodeURIComponent(id)}`, { signal });
  if (!data || data.id !== id || typeof data.name !== "string" || typeof data.email !== "string" || [data.avatar, data.bio, data.address].some((value) => value !== undefined && value !== null && typeof value !== "string")) throw new Error(i18n.t("common.invalidResponse"));
  return data;
}

export function getProjects(page: number, signal: AbortSignal) {
  return getPage<Project>("/projects", page, signal);
}
export function getUserBoards(page: number, signal: AbortSignal) {
  return getPage<Board>("/boards", page, signal);
}
export function getProjectBoards(id: string, page: number, signal: AbortSignal) {
  return getPage<Board>(`/projects/${id}/boards`, page, signal);
}
export async function getProject(id: string, signal: AbortSignal) {
  return (await apiClient.get<Project>(`/projects/${id}`, { signal })).data;
}
export async function getBoard(id: string, signal: AbortSignal) {
  return (await apiClient.get<BoardDetails>(`/boards/${id}`, { signal })).data;
}
export async function getBoardLabels(id: string, signal: AbortSignal) {
  return (await apiClient.get<BoardLabel[]>(`/boards/${id}/labels`, { signal })).data;
}
export async function getMembers(kind: MemberScope, id: string, page: number, signal: AbortSignal): Promise<ApiEnvelope<Member[]>> {
  if (kind === "projects") {
    const result = await getPage<ProjectMember>(`/projects/${id}/members`, page, signal);
    return { ...result, data: result.data.map(({ id, ...member }) => ({ ...member, userId: id })) };
  }
  const result = await apiClient.get<BoardMember[]>(`/boards/${id}/members`, { signal });
  if (!Array.isArray(result.data)) throw new Error("Phản hồi thành viên không hợp lệ.");
  return result;
}
export async function getRoles(signal: AbortSignal) {
  return (await apiClient.get<Role[]>("/roles", { signal })).data;
}

export function createProject(input: CreateCatalogInput) {
  return apiClient.post<Project>("/projects", input);
}
export function createBoard(projectId: string, input: CreateCatalogInput) {
  return apiClient.post<BoardDetails>(`/projects/${projectId}/boards`, input);
}
export function updateProject(id: string, input: UpdateCatalogInput) {
  return apiClient.patch(`/projects/${id}`, input);
}
export function updateBoard(id: string, input: UpdateCatalogInput) {
  return apiClient.patch(`/boards/${id}`, input);
}
export function changeCatalogLifecycle({ kind, id, action }: CatalogLifecycleInput) {
  return action === "delete" ? apiClient.delete(`/${kind}/${id}`) : apiClient.patch(`/${kind}/${id}/${action}`);
}
export function uploadBoardBackground(id: string, file: File, signal: AbortSignal) {
  const form = new FormData();
  form.append("background", file);
  return apiClient.post(`/boards/${id}/background`, form, { signal });
}
export function changeMemberRole(kind: MemberScope, id: string, input: ChangeMemberRoleInput) {
  return apiClient.patch(`/${kind}/${id}/members`, input);
}
export function removeMember(kind: MemberScope, id: string, input: RemoveMemberInput) {
  return apiClient.delete(`/${kind}/${id}/members`, { data: input });
}
export async function inviteMember(kind: MemberScope, id: string, input: InviteMemberInput) {
  const response = await apiClient.post<Invitation>(`/invitations/${kind}/${id}`, input);
  if (!response.data.delivery || !["SENT", "FAILED"].includes(response.data.delivery.email)) {
    throw new Error("Không xác định được kết quả gửi lời mời.");
  }
  return response.data;
}
export function respondToInvitation(token: string, action: InvitationAction) {
  return apiClient.post<string>(`/invitations/${encodeURIComponent(token)}/${action}`);
}
export async function createShareLink(kind: MemberScope, id: string, roleId: string) {
  const { data } = await apiClient.post<Invitation>(`/invitations/${kind}/${id}/share-link`, { roleId });
  if (data?.type !== "LINK" || typeof data.token !== "string" || !data.token || data.token.length > 512 || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error(i18n.t("common.invalidResponse"));
  return data;
}
