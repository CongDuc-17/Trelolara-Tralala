import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSessionVersion, refreshApiSession } from "@/lib/apiClient";
import { useSession } from "@/features/auth/session-context";
import { boardQueue } from "./boardQueue";
import { newerRevision, readBoardEvent } from "./realtime";
import { refreshTaskQueries } from "@/features/discovery/cache";

export function useBoardRealtime(boardId: string, enabled: boolean) {
  const client = useQueryClient();
  const { user } = useSession();
  const userId = user?.id;
  const version = getSessionVersion();
  const [status, setStatus] = useState<"connecting" | "live" | "offline" | "forbidden">("connecting");
  const [retry, setRetry] = useState(0);
  const revoked = useRef("");
  useEffect(() => {
    if (!enabled || !userId) return;
    const subscription = JSON.stringify([version, userId, boardId]);
    if (revoked.current === subscription) return;
    const scope = ["kanban", version, userId, boardId] as const;
    const catalog = ["catalog", version, userId] as const;
    const discovery = ["discovery", version, userId] as const;
    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let acknowledgement: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0; let refreshed = false; let revision: string | null = null;
    let subscribed = false;
    let dirty = false; let syncing = false;
    const current = () => !controller.signal.aborted && version === getSessionVersion();
    async function sync() {
      dirty = true;
      if (syncing) return;
      syncing = true;
      try {
        while (dirty && current()) {
          dirty = false;
          await boardQueue(client, scope).wait(controller.signal);
          if (!current()) return;
          await client.cancelQueries({ queryKey: scope });
          await Promise.all([client.invalidateQueries({ queryKey: scope }, { throwOnError: true }), client.invalidateQueries({ queryKey: catalog }, { throwOnError: true }), refreshTaskQueries(client, discovery)]);
        }
        if (current() && subscribed && socket?.readyState === WebSocket.OPEN) setStatus("live");
      } catch { if (current()) setStatus("offline"); }
      finally { syncing = false; }
    }
    function reconnect() {
      if (!current()) return;
      setStatus("offline");
      if (attempts >= 8 || !navigator.onLine) return;
      const delay = Math.min(30_000, 500 * 2 ** attempts++);
      timer = setTimeout(connect, delay);
    }
    function connect() {
      if (!current()) return;
      subscribed = false;
      try {
        const url = new URL(import.meta.env.VITE_WS_URL);
        if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password) throw new Error();
        socket = new WebSocket(url.href);
      } catch { reconnect(); return; }
      const connection = socket;
      acknowledgement = setTimeout(() => connection.close(), 10_000);
      connection.onopen = () => {
        if (current()) {
          connection.send(JSON.stringify({ event: "board:subscribe", data: { boardId } }));
        }
      };
      connection.onmessage = (event: MessageEvent<unknown>) => {
        if (!current()) return;
        const message = readBoardEvent(event.data, boardId);
        if (!message) return;
        if (message.event === "board:unsubscribed") {
          if (message.data.reason === "forbidden") {
            revoked.current = subscription;
            boardQueue(client, scope).revoke();
            clearTimeout(acknowledgement);
            controller.abort();
            setStatus("forbidden");
            void client.cancelQueries({ queryKey: scope });
            client.removeQueries({ queryKey: scope });
            client.removeQueries({ queryKey: [...catalog, "boards", boardId] });
            void client.invalidateQueries({ queryKey: catalog });
            void client.resetQueries({ queryKey: discovery });
            connection.close();
          }
          return;
        }
        if (message.event === "board:subscribed") { clearTimeout(acknowledgement); subscribed = true; attempts = 0; refreshed = false; revision = message.data.revision; void sync(); }
        else if (newerRevision(message.data.revision, revision)) { revision = message.data.revision; void sync(); }
      };
      connection.onerror = () => { if (current()) setStatus("offline"); };
      connection.onclose = async (event) => {
        clearTimeout(acknowledgement);
        subscribed = false;
        if (!current()) return;
        if (event.code === 1008) {
          if (refreshed) { setStatus("offline"); return; }
          refreshed = true;
          try { await refreshApiSession(); } catch { if (current()) setStatus("offline"); return; }
        }
        reconnect();
      };
    }
    const resume = () => {
      if (!current()) return;
      if (!socket || socket.readyState === WebSocket.CLOSED) { clearTimeout(timer); attempts = 0; connect(); }
      else if (socket.readyState === WebSocket.OPEN && subscribed) void sync();
    };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visible);
    connect();
    return () => {
      controller.abort(); clearTimeout(timer); clearTimeout(acknowledgement);
      window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", visible);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "board:unsubscribe", data: { boardId } }));
        socket.close();
      }
    };
  }, [client, boardId, enabled, userId, version, retry]);
  return { status, retry: () => setRetry((value) => value + 1) };
}
