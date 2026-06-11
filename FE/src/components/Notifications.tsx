import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, CircleArrowDown } from "lucide-react";
import { Switch } from "./ui/switch";
import { apiClient } from "@/lib/apiClient";
import { useCallback, useEffect, useRef, useState } from "react";
import { RiTrelloFill } from "react-icons/ri";
import { PiCardsThreeBold } from "react-icons/pi";
import { VscProject } from "react-icons/vsc";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

let ws: WebSocket | null = null;
let isMountedGlobal = true;

const initWebSocket = async (
  onNotification: (notification: any) => void,
  onUnreadCount: (count: number) => void,
) => {
  // Kiểm tra xem component còn mounted hay không
  if (!isMountedGlobal) return;

  // Đóng connection cũ nếu đang tồn tại
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    ws.close();
  }

  if (!isMountedGlobal) return;

  try {
    ws = new WebSocket(import.meta.env.VITE_WS_URL);

    ws.onopen = () => {
      if (!isMountedGlobal) return;
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      if (!isMountedGlobal) return;
      try {
        const message = JSON.parse(event.data);
        console.log("[WS] Message received:", message);

        if (message.event === "notification:new") {
          onNotification(message.data);
        } else if (message.event === "notification:unread-count") {
          onUnreadCount(message.data.count);
        }
      } catch (error) {
        console.error("[WS] Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      if (!isMountedGlobal) return;
      console.error("[WS] Error:", error);
    };

    ws.onclose = () => {
      if (!isMountedGlobal) return;
      console.log("[WS] Disconnected");
    };
  } catch (error) {
    console.error("[WS] Connection error:", error);
  }
};

const disconnectWebSocket = () => {
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    ws.close();
    ws = null;
  }
};

export function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showRead, setShowRead] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const wsInitializedRef = useRef(false);
  // Lưu callback mới nhất vào ref để WS listener không bao giờ stale
  const onNotificationRef = useRef<(n: any) => void>(() => {});
  const onUnreadCountRef = useRef<(c: number) => void>(() => {});

  const getNotifications = useCallback(async (page = 1, append = false) => {
    try {
      setIsLoading(true);
      const response = await apiClient.get("/notifications", {
        params: { page, limit: 10 },
      });

      const data: any[] = response.data ?? [];
      const more: boolean = response.data?.hasMore ?? data.length === 10;

      setNotifications((prev) => (append ? [...prev, ...data] : data));
      setHasMore(more);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUnreadCount = useCallback(async () => {
    try {
      const response = await apiClient.get("/notifications/unread-count");
      setUnreadCount(response?.data?.count ?? 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  }, []);

  const handleNewNotification = useCallback((notification: any) => {
    // Thêm notification mới lên đầu, tránh trùng lặp
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notification.id)) return prev;
      return [notification, ...prev];
    });

    setUnreadCount((prev) => prev + 1);
  }, []);

  const handleUnreadCountUpdate = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  // Giữ ref đồng bộ với callback mới nhất
  useEffect(() => {
    onNotificationRef.current = handleNewNotification;
  }, [handleNewNotification]);

  useEffect(() => {
    onUnreadCountRef.current = handleUnreadCountUpdate;
  }, [handleUnreadCountUpdate]);

  useEffect(() => {
    isMountedGlobal = true;
    initWebSocket(
      (n) => onNotificationRef.current(n),
      (c) => onUnreadCountRef.current(c),
    );
    wsInitializedRef.current = true;

    getNotifications(1);
    getUnreadCount();

    return () => {
      isMountedGlobal = false;
      disconnectWebSocket();
    };
  }, [getNotifications, getUnreadCount]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) {
        // Reset về trang 1 và fetch mới nhất
        setCurrentPage(1);
        getNotifications(1, false);
      }
    },
    [getNotifications],
  );

  const loadNextPage = useCallback(async () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await getNotifications(nextPage, true);
  }, [currentPage, getNotifications]);

  const handleReadNoti = useCallback(
    async (notificationId: string, isRead: boolean) => {
      if (isRead) return; // Đã đọc rồi, không làm gì

      try {
        await apiClient.patch(`/notifications/${notificationId}/read`);

        // Cập nhật local state ngay lập tức, không fetch lại toàn bộ
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        );

        // Giảm badge count
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    },
    [],
  );

  const getNotificationLink = useCallback((notification: any) => {
    const { entityType, entityId, metadata } = notification;
    switch (entityType) {
      case "BOARD":
        return `/boards/${entityId}`;
      case "CARD":
        return `/boards/${metadata?.boardId}/cards/${entityId}`;
      case "PROJECT":
        return `/projects/${entityId}`;
      default:
        return "#";
    }
  }, []);

  const filtered = notifications.filter((n) => n.isRead === showRead);

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <div className="relative cursor-pointer">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-4 w-4 rounded-full p-0 flex items-center justify-center text-xs bg-red-500 text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-100">
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <Label>Notifications</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="show-read"
                checked={showRead}
                onCheckedChange={setShowRead}
              />
              <Label htmlFor="show-read">{showRead ? "Read" : "Unread"}</Label>
            </div>
          </div>

          <div className="max-h-100 overflow-y-auto mt-4">
            {filtered.length === 0 && !isLoading && (
              <p className="text-center text-sm text-muted-foreground py-6">
                {showRead ? "No read notifications" : "No unread notifications"}
              </p>
            )}

            {filtered.map((notification) => (
              <Link
                key={notification.id}
                to={getNotificationLink(notification)}
                onClick={() =>
                  handleReadNoti(notification.id, notification.isRead)
                }
                className="block"
              >
                <Card
                  className={`flex flex-row items-center gap-3 p-3 mb-2 cursor-pointer hover:bg-gray-100 transition-colors ${
                    !notification.isRead ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex-shrink-0">
                    {notification.entityType === "BOARD" && <RiTrelloFill />}
                    {notification.entityType === "CARD" && <PiCardsThreeBold />}
                    {notification.entityType === "PROJECT" && <VscProject />}
                  </div>
                  <div className="flex-1">
                    <CardTitle>
                      <div className="font-medium text-sm">
                        {notification.type}
                      </div>
                    </CardTitle>
                    <CardDescription>{notification.content}</CardDescription>
                    <div className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        notification.isRead ? "" : "bg-blue-500"
                      }`}
                    />
                  </div>
                </Card>
              </Link>
            ))}

            {hasMore && (
              <div
                className="flex items-center justify-center text-sm text-gray-500 cursor-pointer hover:text-gray-700 py-3 transition-colors"
                onClick={loadNextPage}
                role="button"
              >
                <CircleArrowDown
                  className={isLoading ? "animate-spin" : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
