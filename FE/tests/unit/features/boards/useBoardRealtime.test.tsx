import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createQueryClient } from "@/app/queryClient";
import { getSessionVersion, resetApiSession } from "@/lib/apiClient";
import { deferred } from "../../../support/helpers";
import { useBoardRealtime } from "@/features/boards/useBoardRealtime";

const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/apiClient", async (original) => ({ ...await original<object>(), refreshApiSession: refresh }));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "alice" } }) }));
class Socket {
  static OPEN = 1; static CLOSED = 3; static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.({ code: 1000 } as CloseEvent); });
  constructor() { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(event: string, data: object) { this.onmessage?.({ data: JSON.stringify({ event, data: { boardId: "board", ...data } }) } as MessageEvent); }
  disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code } as CloseEvent); }
}
let client = createQueryClient();
beforeEach(() => { resetApiSession(); client = createQueryClient(); Socket.instances = []; vi.stubGlobal("WebSocket", Socket); refresh.mockClear(); });
afterEach(() => { client.clear(); vi.useRealTimers(); });
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const latest = () => Socket.instances.at(-1)!;

it("subscribes, always resyncs an acknowledgement and ignores duplicate/older decimal revisions", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  renderHook(() => useBoardRealtime("board", true), { wrapper });
  act(() => latest().open());
  expect(latest().send).toHaveBeenCalledWith(JSON.stringify({ event: "board:subscribe", data: { boardId: "board" } }));
  await act(async () => latest().emit("board:subscribed", { revision: "9007199254740992" }));
  expect(invalidate).toHaveBeenCalledTimes(3);
  await act(async () => { latest().emit("board:changed", { revision: "9007199254740992" }); latest().emit("board:changed", { revision: "9" }); });
  expect(invalidate).toHaveBeenCalledTimes(3);
  await act(async () => latest().emit("board:changed", { revision: "9007199254740993" }));
  expect(invalidate).toHaveBeenCalledTimes(6);
  await act(async () => latest().emit("board:subscribed", { revision: "9007199254740993" }));
  expect(invalidate).toHaveBeenCalledTimes(9);
});
it("runs another refetch when a newer revision arrives during a refetch", async () => {
  const gate = deferred<void>(); let reads = 0;
  vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => { if (filters?.queryKey?.[0] === "kanban" && ++reads === 1) await gate.promise; });
  renderHook(() => useBoardRealtime("board", true), { wrapper });
  await act(async () => { latest().open(); latest().emit("board:subscribed", { revision: "1" }); });
  await act(async () => latest().emit("board:changed", { revision: "20" }));
  expect(reads).toBe(1);
  await act(async () => gate.resolve());
  expect(reads).toBe(2);
});
it("reconnects with backoff and resubscribes after a normal disconnect", async () => {
  vi.useFakeTimers(); vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  renderHook(() => useBoardRealtime("board", true), { wrapper });
  act(() => { latest().open(); latest().disconnect(); });
  await act(async () => vi.advanceTimersByTimeAsync(499)); expect(Socket.instances).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(Socket.instances).toHaveLength(2);
  act(() => latest().open()); expect(latest().send).toHaveBeenCalledOnce();
});
it("refreshes cookies once for an expired connection and stops a repeated policy rejection", async () => {
  vi.useFakeTimers(); renderHook(() => useBoardRealtime("board", true), { wrapper });
  await act(async () => latest().disconnect(1008));
  expect(refresh).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(500));
  await act(async () => latest().disconnect(1008));
  expect(refresh).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(60_000)); expect(Socket.instances).toHaveLength(2);
});
it("bounds a stalled connection and stops after eight reconnect attempts", async () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useBoardRealtime("board", true), { wrapper });
  await act(async () => vi.advanceTimersByTimeAsync(300_000));
  expect(Socket.instances).toHaveLength(9);
  expect(hook.result.current.status).toBe("offline");
  await act(async () => vi.advanceTimersByTimeAsync(300_000));
  expect(Socket.instances).toHaveLength(9);
});
it("removes content on permission revocation and does not reconnect", async () => {
  vi.useFakeTimers(); vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const scope = ["kanban", getSessionVersion(), "alice", "board"];
  client.setQueryData([...scope, "lists"], [{ id: "private" }]);
  const hook = renderHook(() => useBoardRealtime("board", true), { wrapper });
  act(() => latest().emit("board:unsubscribed", { reason: "forbidden" }));
  expect(hook.result.current.status).toBe("forbidden"); expect(client.getQueryData([...scope, "lists"])).toBeUndefined();
  await act(async () => vi.advanceTimersByTimeAsync(60_000)); expect(Socket.instances).toHaveLength(1);
});
it("unsubscribes and closes on navigation, and ignores frames from an expired session", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const hook = renderHook(() => useBoardRealtime("board", true), { wrapper }); const socket = latest();
  act(() => socket.open()); resetApiSession();
  await act(async () => socket.emit("board:changed", { revision: "1" }));
  expect(invalidate).not.toHaveBeenCalled();
  hook.unmount(); expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ event: "board:unsubscribe", data: { boardId: "board" } }));
  expect(socket.close).toHaveBeenCalledOnce(); expect(socket.onmessage).toBeNull();
});
it("keeps a revoked subscription closed when metadata refetch toggles the enabled flag", async () => {
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const hook = renderHook(({ enabled }) => useBoardRealtime("board", enabled), { wrapper, initialProps: { enabled: true } });
  act(() => latest().emit("board:unsubscribed", { reason: "forbidden" }));
  hook.rerender({ enabled: false }); hook.rerender({ enabled: true });
  expect(Socket.instances).toHaveLength(1);
  expect(hook.result.current.status).toBe("forbidden");
});
