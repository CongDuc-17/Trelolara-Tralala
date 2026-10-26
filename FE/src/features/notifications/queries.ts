import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-context";
import { getSessionVersion, refreshApiSession } from "@/lib/apiClient";
import { getNotifications, getUnreadCount, markNotificationRead } from "./api";
import { readNotificationEvent, type Notification, type NotificationPage } from "./types";

export function useNotifications(isRead = false) {
  const client = useQueryClient();
  const reconnect = useRef<() => void>(() => undefined);
  const { user } = useSession();
  const version = getSessionVersion();
  const userId = user?.id;
  const scope = ["notifications", version, userId] as const;
  const listScope = [...scope, "list"] as const;
  const listKey = [...listScope, isRead] as const;
  const countKey = [...scope, "unread-count"] as const;
  const list = useInfiniteQuery({
    queryKey: listKey, enabled: !!userId, initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => getNotifications(pageParam, signal, isRead),
    getNextPageParam: (page) => page.nextPage,
  });
  const count = useQuery({ queryKey: countKey, enabled: !!userId, queryFn: ({ signal }) => getUnreadCount(signal) });
  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (_, id) => {
      if (version !== getSessionVersion()) return;
      void client.cancelQueries({ queryKey: listScope });
      for (const [key, data] of client.getQueriesData<InfiniteData<NotificationPage>>({ queryKey: listScope })) {
        if (!data) continue;
        client.setQueryData(key, { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => item.id === id ? { ...item, isRead: true } : item).filter((item) => item.isRead === key.at(-1)) })) });
      }
      void client.invalidateQueries({ queryKey: listScope });
      // The server also emits an absolute count; refetch avoids decrementing it twice.
      void client.invalidateQueries({ queryKey: countKey });
    },
  });

  useEffect(() => {
    if (!userId) return;
    const listScope = ["notifications", version, userId, "list"] as const;
    const countKey = ["notifications", version, userId, "unread-count"] as const;
    const received = new Set<string>();
    let active = true;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectionTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0; let refreshed = false;
    let url: URL;
    try {
      url = new URL(import.meta.env.VITE_WS_URL);
      if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password) return;
    } catch { return; }
    const current = () => active && version === getSessionVersion();
    function sync() {
      // Reconnect may miss events; offset pages must restart from the first page.
      for (const [key, data] of client.getQueriesData<InfiniteData<NotificationPage>>({ queryKey: listScope })) {
        if (data) client.setQueryData(key, { ...data, pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) });
      }
      void client.invalidateQueries({ queryKey: listScope });
      void client.invalidateQueries({ queryKey: countKey });
    }
    function schedule() {
      if (!current() || attempts >= 8 || !navigator.onLine) return;
      timer = setTimeout(connect, Math.min(30_000, 500 * 2 ** attempts++));
    }
    function connect() {
      if (!current()) return;
      try { socket = new WebSocket(url.href); }
      catch { schedule(); return; }
      const connection = socket;
      connectionTimer = setTimeout(() => connection.close(), 10_000);
      connection.onopen = () => {
        if (!current() || socket !== connection) return;
        clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => { attempts = 0; refreshed = false; }, 10_000);
        sync();
      };
      connection.onmessage = (event: MessageEvent<unknown>) => {
        if (!current() || socket !== connection) return;
        const message = readNotificationEvent(event.data);
        if (!message) return;
        if (message.event === "notification:unread-count") {
          void client.cancelQueries({ queryKey: countKey });
          client.setQueryData(countKey, message.data.count);
          return;
        }
        const notification = message.data;
        const lists = client.getQueriesData<InfiniteData<NotificationPage>>({ queryKey: listScope });
        if (received.has(notification.id) || lists.some(([, data]) => data?.pages.some((page) => page.items.some((item) => item.id === notification.id)))) return;
        received.add(notification.id);
        for (const [key, data] of lists) {
          if (key.at(-1) !== notification.isRead) continue;
          void client.cancelQueries({ queryKey: key, exact: true });
          if (data?.pages.length) client.setQueryData(key, { ...data, pages: data.pages.map((page, index) => index === 0 ? { ...page, items: [notification, ...page.items] } : page) });
          else void client.invalidateQueries({ queryKey: key, exact: true });
        }
        if (!notification.isRead) {
          void client.cancelQueries({ queryKey: countKey });
          client.setQueryData<number>(countKey, (previous) => (previous ?? 0) + 1);
        }
      };
      connection.onerror = () => { if (current()) connection.close(); };
      connection.onclose = async (event) => {
        if (!current() || socket !== connection) return;
        clearTimeout(connectionTimer);
        if (event.code === 1008) {
          if (refreshed) return;
          refreshed = true;
          try { await refreshApiSession(); } catch { return; }
          if (!current() || socket !== connection) return;
        }
        schedule();
      };
    }
    const resume = () => {
      if (!current()) return;
      if (!socket || socket.readyState === WebSocket.CLOSED) { clearTimeout(timer); attempts = 0; connect(); }
    };
    const visible = () => { if (document.visibilityState === "visible") { resume(); sync(); } };
    reconnect.current = resume;
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visible);
    connect();
    return () => {
      active = false; clearTimeout(timer); clearTimeout(connectionTimer);
      reconnect.current = () => undefined;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visible);
      if (socket) { socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null; socket.close(); }
    };
  }, [client, version, userId]);

  const notifications = [...new Map(list.data?.pages.flatMap((page) => page.items).map((notification) => [notification.id, notification])).values()];
  return {
    notifications, unreadCount: count.data ?? 0, isLoading: list.isFetching, hasMore: list.hasNextPage,
    readPending: read.isPending, clearReadError: read.reset,
    error: list.error ?? count.error ?? read.error,
    refresh: () => {
      reconnect.current();
      read.reset();
      client.setQueryData<InfiniteData<NotificationPage>>(listKey, (previous) => previous && ({
        ...previous, pages: previous.pages.slice(0, 1), pageParams: previous.pageParams.slice(0, 1),
      }));
      void list.refetch();
      void count.refetch();
    },
    loadNextPage: () => { if (!list.isFetching && list.hasNextPage) void list.fetchNextPage(); },
    markRead: (notification: Notification) => {
      if (!notification.isRead && !(read.isPending && read.variables === notification.id)) read.mutate(notification.id);
    },
  };
}
