import { apiClient } from "@/lib/apiClient";
import { isUser, type User } from "@/features/auth/types";

export type UpdateProfileInput = { name: string; address: string; bio: string; avatarFile: File | null };

export async function getMyInformation(signal?: AbortSignal) {
  const response = await apiClient.get<User>("/users/me", { signal });
  if (!isUser(response.data)) throw new Error("Phản hồi thông tin người dùng không hợp lệ.");
  return response.data;
}

export function updateMyInformation(input: UpdateProfileInput) {
  const data = new FormData();
  data.append("name", input.name);
  data.append("address", input.address);
  data.append("bio", input.bio);
  if (input.avatarFile) data.append("avatar", input.avatarFile);
  return apiClient.put<User>("/users/me", data);
}

export const changePassword = (input: { newPassword: string }) => apiClient.patch<User>("/users/me/change-password", input);
