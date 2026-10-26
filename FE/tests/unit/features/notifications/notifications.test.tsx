import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { type AxiosAdapter } from "axios";
import { Notifications } from "@/components/Notifications";
import { SessionContext, type Session } from "@/features/auth/session-context";
import * as transport from "@/lib/apiClient";
import { axiosClient, getSessionVersion, resetApiSession } from "@/lib/apiClient";
import { deferred, httpError, reply } from "../../../support/helpers";
import type { Notification } from "@/features/notifications/types";

const first: Notification = {
  id: "first", type: "CARD_ASSIGNED", title: "Giao thẻ", content: "Thẻ cần xem",
  entityType: "CARD", entityId: "card-1", metadata: { boardId: "board-1" },
  isRead: false, createdAt: "2026-10-23T10:00:00.000Z",
};
const second: Notification = { ...first, id: "second", content: "Thẻ tiếp theo" };
const readNotification: Notification = { ...first, id: "read", content: "Thẻ đã đọc", isRead: true };
const sockets: TestSocket[] = [];
class TestSocket {
  static OPEN = 1; static CLOSED = 3;
  readyState = 1;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  close = vi.fn(() => { this.readyState = 3; });
  constructor() { sockets.push(this); }
}
const session: Session = {
  user: { id: "alice", name: "Alice", email: "alice@example.test", avatar: null },
  isLoading: false, isLoggingOut: false, error: null, retry: vi.fn(), startSession: vi.fn(),
  login: vi.fn(), logout: vi.fn(), getMyInformation: vi.fn(),
};
const blockedAdapter = axiosClient.defaults.adapter;
let client: QueryClient;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
let unreadCount: number;
let firstPage: Notification[];
let failNextPage: boolean;
let failRead: boolean;

beforeEach(() => {
  resetApiSession();
  sockets.length = 0;
  vi.stubGlobal("WebSocket", TestSocket);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  unreadCount = 1; firstPage = [first, readNotification]; failNextPage = false; failRead = false;
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    if (config.url === "/notifications") {
      const page = Number(config.params?.page);
      if (page === 2 && failNextPage) throw httpError(config, 403, "Không thể tải trang tiếp theo");
      return reply(config, {
        success: true, data: (page === 1 ? firstPage : [second]).filter((item) => item.isRead === config.params?.isRead),
        pagination: { totalItems: 3, itemsPerPage: 10, currentPage: page, totalPages: 2 },
      });
    }
    if (config.url === "/notifications/unread-count") return reply(config, { success: true, data: { count: unreadCount } });
    if (config.url === "/notifications/first/read") {
      if (failRead) throw httpError(config, 403, "Không thể đánh dấu đã đọc");
      firstPage = firstPage.map((item) => item.id === first.id ? { ...item, isRead: true } : item);
      unreadCount = 0;
      return reply(config, { success: true, data: null });
    }
    throw new Error(`Unexpected URL ${config.url}`);
  });
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); vi.useRealTimers(); axiosClient.defaults.adapter = blockedAdapter; });

function renderNotifications() {
  return render(<MemoryRouter><QueryClientProvider client={client}><SessionContext.Provider value={session}>
    <Notifications />
  </SessionContext.Provider></QueryClientProvider></MemoryRouter>);
}

async function openNotifications() {
  await screen.findByRole("button", { name: "Thông báo, 1 chưa đọc" });
  await userEvent.setup().click(screen.getByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  await screen.findByText(first.content);
}

function receive(message: unknown) {
  act(() => { sockets.at(-1)?.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<unknown>); });
}

it("renders the badge, keeps the read filter and updates it only after a successful read", async () => {
  renderNotifications();
  await openNotifications();
  expect(screen.queryByText(readNotification.content)).toBeNull();
  const link = screen.getByRole("link", { name: new RegExp(first.content) });
  expect(link.getAttribute("href")).toBe("/boards/board-1/cards/card-1");
  await userEvent.setup().click(link);
  await waitFor(() => expect(screen.queryByText(first.content)).toBeNull());
  await screen.findByRole("button", { name: "Thông báo" });
  await userEvent.setup().click(screen.getByRole("switch"));
  expect(await screen.findByText(first.content)).toBeTruthy();
  expect(screen.getByText(readNotification.content)).toBeTruthy();
});

it("keeps unread state and presents a failed read without losing the list", async () => {
  failRead = true;
  renderNotifications();
  await openNotifications();
  await userEvent.setup().click(screen.getByRole("link", { name: new RegExp(first.content) }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Không thể đánh dấu đã đọc"));
  expect(screen.getByRole("button", { name: "Thông báo, 1 chưa đọc" })).toBeTruthy();
  expect(screen.getByText(first.content)).toBeTruthy();
});

it("retries the failed next page without skipping it and resets pages when reopened", async () => {
  failNextPage = true;
  renderNotifications();
  await openNotifications();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tải thêm thông báo" }));
  await screen.findByRole("alert");
  failNextPage = false;
  await user.click(screen.getByRole("button", { name: "Tải thêm thông báo" }));
  expect(await screen.findByText(second.content)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Tải thêm thông báo" })).toBeNull();
  const requestedPages = adapter.mock.calls.filter(([config]) => config.url === "/notifications").map(([config]) => config.params.page);
  expect(requestedPages.slice(-2)).toEqual([2, 2]);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  await waitFor(() => expect(screen.queryByText(second.content)).toBeNull());
  expect(screen.getByRole("button", { name: "Tải thêm thông báo" })).toBeTruthy();
});

it("validates socket payloads and deduplicates notifications and badge increments", async () => {
  renderNotifications();
  await openNotifications();
  receive({ event: "notification:new", data: second });
  expect(await screen.findByText(second.content)).toBeTruthy();
  await screen.findByRole("button", { name: "Thông báo, 2 chưa đọc" });
  receive({ event: "notification:new", data: second });
  receive({ event: "notification:new", data: { id: "malformed" } });
  receive({ event: "notification:unread-count", data: { count: -1 } });
  expect(screen.getAllByText(second.content)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" })).toBeTruthy();
  receive({ event: "notification:unread-count", data: { count: 110 } });
  expect(await screen.findByRole("button", { name: "Thông báo, 110 chưa đọc" })).toHaveProperty("textContent", "99+");
});

it("ignores non-object metadata when constructing a card link", async () => {
  firstPage = [{ ...first, metadata: ["board-1"] }];
  renderNotifications();
  await openNotifications();
  expect(screen.queryByRole("link", { name: new RegExp(first.content) })).toBeNull();
  expect(screen.getByRole("button", { name: "Đánh dấu đã đọc: " + first.title })).toBeTruthy();
});

it("closes its own socket and ignores its late callback after unmount", async () => {
  const view = renderNotifications();
  await openNotifications();
  const lateMessage = sockets[0].onmessage;
  const key = ["notifications", getSessionVersion(), "alice", "unread-count"];
  expect(client.getQueryData(key)).toBe(1);
  view.unmount();
  expect(sockets[0].close).toHaveBeenCalledOnce();
  expect(sockets[0].onmessage).toBeNull();
  act(() => { lateMessage?.({ data: '{"event":"notification:unread-count","data":{"count":9}}' } as MessageEvent<unknown>); });
  expect(client.getQueryData(key)).toBe(1);
});

it("aborts a pending HTTP list when the component unmounts", async () => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/notifications") await gate.promise;
    return base(config);
  });
  const view = renderNotifications();
  await waitFor(() => expect(adapter.mock.calls.some(([config]) => config.url === "/notifications")).toBe(true));
  const request = adapter.mock.calls.find(([config]) => config.url === "/notifications")![0];
  view.unmount();
  expect(request.signal?.aborted).toBe(true);
  await act(async () => { gate.resolve(); await gate.promise; });
});

it("keeps a confirmed read when an older list refresh finishes later", async () => {
  renderNotifications();
  await openNotifications();
  await waitFor(() => expect(client.isFetching({ queryKey: ["notifications"] })).toBe(0));
  const gate = deferred<void>();
  const stalePage = [...firstPage];
  const base = adapter.getMockImplementation()!;
  let held = false;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/notifications" && config.params?.isRead === false && !held) {
      held = true;
      await gate.promise;
      return reply(config, { success: true, data: stalePage.filter((item) => !item.isRead), pagination: { totalItems: 2, itemsPerPage: 10, currentPage: 1, totalPages: 1 } });
    }
    return base(config);
  });
  const user = userEvent.setup();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  await waitFor(() => expect(client.isFetching({ queryKey: ["notifications"] })).toBe(1));
  const staleRequest = adapter.mock.calls.filter(([config]) => config.url === "/notifications").at(-1)![0];
  await user.click(screen.getByRole("link", { name: new RegExp(first.content) }));
  await screen.findByRole("button", { name: "Thông báo" });
  expect(staleRequest.signal?.aborted).toBe(true);
  await act(async () => gate.resolve());
  expect(screen.queryByText(first.content)).toBeNull();
  await user.click(screen.getByRole("switch"));
  expect(await screen.findByText(first.content)).toBeTruthy();
});

it("keeps a live notification when an older list refresh finishes later", async () => {
  renderNotifications();
  await openNotifications();
  await waitFor(() => expect(client.isFetching({ queryKey: ["notifications"] })).toBe(0));
  const gate = deferred<void>();
  const stalePage = [...firstPage];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/notifications") {
      await gate.promise;
      return reply(config, { success: true, data: stalePage, pagination: { totalItems: 2, itemsPerPage: 10, currentPage: 1, totalPages: 1 } });
    }
    return base(config);
  });
  const user = userEvent.setup();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  await waitFor(() => expect(client.isFetching({ queryKey: ["notifications"] })).toBe(1));
  const staleRequest = adapter.mock.calls.filter(([config]) => config.url === "/notifications").at(-1)![0];
  receive({ event: "notification:new", data: second });
  receive({ event: "notification:unread-count", data: { count: 2 } });
  expect(await screen.findByText(second.content)).toBeTruthy();
  expect(staleRequest.signal?.aborted).toBe(true);
  await act(async () => gate.resolve());
  expect(screen.getByText(second.content)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" })).toBeTruthy();
});

it("replaces an initial stale request when a notification arrives before the first page", async () => {
  const gate = deferred<void>();
  const stalePage = [...firstPage];
  const base = adapter.getMockImplementation()!;
  let initial = true;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/notifications" && initial) {
      initial = false;
      await gate.promise;
      return reply(config, { success: true, data: stalePage, pagination: { totalItems: 2, itemsPerPage: 10, currentPage: 1, totalPages: 1 } });
    }
    return base(config);
  });
  renderNotifications();
  await waitFor(() => expect(adapter.mock.calls.some(([config]) => config.url === "/notifications")).toBe(true));
  const staleRequest = adapter.mock.calls.find(([config]) => config.url === "/notifications")![0];
  firstPage = [second, ...firstPage];
  unreadCount = 2;
  receive({ event: "notification:new", data: second });
  receive({ event: "notification:new", data: second });
  receive({ event: "notification:unread-count", data: { count: 2 } });
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.url === "/notifications")).toHaveLength(2));
  expect(staleRequest.signal?.aborted).toBe(true);
  await waitFor(() => expect(client.isFetching({ queryKey: ["notifications"] })).toBe(0));
  await userEvent.setup().click(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" }));
  expect(await screen.findByText(second.content)).toBeTruthy();
  await act(async () => gate.resolve());
  expect(screen.getAllByText(second.content)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" })).toBeTruthy();
});

it("renders the persisted reminder contract with a localized type/date and canonical card link", async () => {
  firstPage = [{ ...first, type: "CARD_DUE_SOON", content: "Card Giao diện is due soon", metadata: { boardId: "board-1", cardId: "card-1", dueDate: "2026-10-24T10:00:00Z", reminderRevision: "revision" } }];
  renderNotifications();
  await userEvent.setup().click(await screen.findByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  expect(await screen.findByText("Nhắc hạn công việc")).toBeTruthy();
  expect(screen.getByText(/^Đến hạn /)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Card Giao diện is due soon/ }).getAttribute("href")).toBe("/boards/board-1/cards/card-1");
});
it("queries the server read filter from page one rather than hiding other loaded pages locally", async () => {
  renderNotifications(); await openNotifications();
  const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Tải thêm thông báo" }));
  await screen.findByText(second.content);
  await user.click(screen.getByRole("switch"));
  expect(await screen.findByText(readNotification.content)).toBeTruthy();
  const request = adapter.mock.calls.filter(([config]) => config.url === "/notifications").at(-1)![0];
  expect(request.params).toEqual({ page: 1, limit: 10, isRead: true });
  expect(screen.queryByText(first.content)).toBeNull();
});

it("does not cancel a read-page request when an unread socket event belongs to another filter", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/notifications" && config.params?.isRead === true) await gate.promise; return base(config); });
  renderNotifications(); await openNotifications();
  await userEvent.setup().click(screen.getByRole("switch"));
  await waitFor(() => expect(adapter.mock.calls.some(([config]) => config.url === "/notifications" && config.params?.isRead === true)).toBe(true));
  const pending = adapter.mock.calls.filter(([config]) => config.params?.isRead === true).at(-1)![0];
  receive({ event: "notification:new", data: second });
  expect(pending.signal?.aborted).toBe(false);
  await act(async () => gate.resolve());
  expect(await screen.findByText(readNotification.content)).toBeTruthy();
  expect(screen.queryByText(second.content)).toBeNull();
});


it("keeps one personal connection and deduplicates events across read-filter changes", async () => {
  renderNotifications(); await openNotifications();
  receive({ event: "notification:new", data: second });
  expect(await screen.findByText(second.content)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("switch"));
  await screen.findByText(readNotification.content);
  expect(sockets).toHaveLength(1);
  receive({ event: "notification:new", data: second });
  expect(client.getQueryData(["notifications", getSessionVersion(), "alice", "unread-count"])).toBe(2);
  await userEvent.setup().click(screen.getByRole("switch"));
  expect(await screen.findByText(second.content)).toBeTruthy();
});

it("reconnects after backoff, reloads missed records and ignores the previous socket", async () => {
  const view = renderNotifications(); await openNotifications();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const previous = sockets[0]; const late = previous.onmessage;
  firstPage = [second, ...firstPage]; unreadCount = 2;
  vi.useFakeTimers();
  previous.readyState = 3;
  await act(async () => { await previous.onclose?.({ code: 1006 } as CloseEvent); });
  await act(async () => vi.advanceTimersByTimeAsync(499));
  expect(sockets).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(sockets).toHaveLength(2);
  await act(async () => { sockets[1].onopen?.(new Event("open")); await vi.advanceTimersByTimeAsync(1); });
  const key = ["notifications", getSessionVersion(), "alice", "unread-count"];
  expect(client.getQueryData(key)).toBe(2);
  act(() => late?.({ data: JSON.stringify({ event: "notification:unread-count", data: { count: 99 } }) } as MessageEvent));
  expect(client.getQueryData(key)).toBe(2);
  view.unmount();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(sockets).toHaveLength(2);
});

it("limits consecutive failed connections and resumes on an online event", async () => {
  const view = renderNotifications(); await openNotifications();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  vi.useFakeTimers();
  for (let attempt = 0; attempt < 8; attempt++) {
    const socket = sockets.at(-1)!; socket.readyState = 3;
    await act(async () => { await socket.onclose?.({ code: 1006 } as CloseEvent); });
    await act(async () => vi.advanceTimersByTimeAsync(Math.min(30_000, 500 * 2 ** attempt)));
    expect(sockets).toHaveLength(attempt + 2);
  }
  const socket = sockets.at(-1)!; socket.readyState = 3;
  await act(async () => { await socket.onclose?.({ code: 1006 } as CloseEvent); });
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(sockets).toHaveLength(9);
  act(() => window.dispatchEvent(new Event("online")));
  expect(sockets).toHaveLength(10);
  view.unmount();
});

it("uses the shared session refresh once for repeated authentication closes", async () => {
  const refresh = vi.spyOn(transport, "refreshApiSession").mockResolvedValue(undefined);
  const view = renderNotifications(); await openNotifications();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  vi.useFakeTimers();
  sockets[0].readyState = 3;
  await act(async () => { await sockets[0].onclose?.({ code: 1008 } as CloseEvent); await vi.advanceTimersByTimeAsync(500); });
  expect(sockets).toHaveLength(2);
  sockets[1].readyState = 3;
  await act(async () => { await sockets[1].onclose?.({ code: 1008 } as CloseEvent); await vi.advanceTimersByTimeAsync(30_000); });
  expect(refresh).toHaveBeenCalledOnce();
  expect(sockets).toHaveLength(2);
  view.unmount();
});

it("ignores an old authentication close when online has already opened a replacement", async () => {
  const refresh = deferred<void>();
  vi.spyOn(transport, "refreshApiSession").mockReturnValue(refresh.promise);
  const view = renderNotifications(); await openNotifications();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  vi.useFakeTimers();
  sockets[0].readyState = 3;
  let closed: unknown;
  act(() => { closed = sockets[0].onclose?.({ code: 1008 } as CloseEvent); });
  act(() => { window.dispatchEvent(new Event("online")); });
  expect(sockets).toHaveLength(2);
  await act(async () => { refresh.resolve(undefined); await closed; await vi.advanceTimersByTimeAsync(500); });
  expect(sockets).toHaveLength(2);
  view.unmount();
});
