export type Notification = {
  id: string;
  type: string;
  title: string;
  content: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
};

export type NotificationPage = { items: Notification[]; nextPage?: number };
export type NotificationEvent =
  | { event: "notification:new"; data: Notification }
  | { event: "notification:unread-count"; data: { count: number } };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNotification(value: unknown): value is Notification {
  return isRecord(value) && typeof value.id === "string" && !!value.id &&
    typeof value.type === "string" && typeof value.title === "string" &&
    typeof value.content === "string" && typeof value.entityType === "string" &&
    typeof value.entityId === "string" && typeof value.isRead === "boolean" &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    (value.readAt === undefined || (typeof value.readAt === "string" && Number.isFinite(Date.parse(value.readAt))));
}

export function isUnreadCount(value: unknown): value is { count: number } {
  return isRecord(value) && typeof value.count === "number" && Number.isSafeInteger(value.count) && value.count >= 0;
}

export function readNotificationEvent(value: unknown): NotificationEvent | null {
  if (typeof value !== "string") return null;
  try {
    const message: unknown = JSON.parse(value);
    if (!isRecord(message)) return null;
    if (message.event === "notification:new" && isNotification(message.data)) {
      return { event: message.event, data: message.data };
    }
    if (message.event === "notification:unread-count" && isUnreadCount(message.data)) {
      return { event: message.event, data: message.data };
    }
  } catch {
    // Other socket messages must never enter the notification cache.
  }
  return null;
}
