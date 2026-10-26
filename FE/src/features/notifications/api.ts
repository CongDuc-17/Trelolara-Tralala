import { apiClient } from "@/lib/apiClient";
import i18n from "@/app/i18n";
import { isNotification, isRecord, isUnreadCount, type NotificationPage } from "./types";

export async function getNotifications(page: number, signal?: AbortSignal, isRead?: boolean): Promise<NotificationPage> {
  const response = await apiClient.get<unknown>("/notifications", { params: { page, limit: 10, ...(isRead !== undefined ? { isRead } : {}) }, signal });
  if (response?.success !== true || !Array.isArray(response.data) || !response.data.every(isNotification) ||
    (isRead !== undefined && response.data.some((item) => item.isRead !== isRead))) {
    throw new Error("Dữ liệu thông báo không hợp lệ.");
  }
  const pagination = response.pagination;
  if (pagination !== undefined && (!isRecord(pagination) || pagination.currentPage !== page || !Number.isSafeInteger(pagination.totalPages) ||
    pagination.totalPages < 0 || !Number.isSafeInteger(pagination.totalItems) || pagination.totalItems < 0 ||
    !Number.isSafeInteger(pagination.itemsPerPage) || pagination.itemsPerPage < 1)) {
    throw new Error("Dữ liệu phân trang thông báo không hợp lệ.");
  }
  const hasMore = pagination ? pagination.currentPage < pagination.totalPages : response.data.length === 10;
  return { items: response.data, nextPage: hasMore ? page + 1 : undefined };
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  const response = await apiClient.get<unknown>("/notifications/unread-count", { signal });
  if (response?.success !== true || !isUnreadCount(response.data)) throw new Error("Số thông báo chưa đọc không hợp lệ.");
  return response.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const response = await apiClient.patch<unknown>(`/notifications/${encodeURIComponent(id)}/read`);
  if (response?.success !== true || response.data !== null) throw new Error("Phản hồi đánh dấu đã đọc không hợp lệ.");
}
export async function markAllNotificationsRead(): Promise<void> {
  const response = await apiClient.patch<unknown>("/notifications/read-all");
  if (response?.success !== true || response.data !== null) throw new Error(i18n.t("common.invalidResponse"));
}
