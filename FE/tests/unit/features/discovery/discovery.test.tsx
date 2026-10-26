import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { AxiosAdapter } from "axios";
import { axiosClient, getSessionVersion, resetApiSession } from "@/lib/apiClient";
import { createQueryClient } from "@/app/queryClient";
import { testCard } from "../../../support/fixtures";
import { deferred, httpError, reply } from "../../../support/helpers";
import { useCardActions } from "@/features/cards/queries";
import { readTaskPage } from "@/features/discovery/api";
import { useTaskSearch } from "@/features/discovery/queries";
import { TaskScreen } from "@/features/discovery/TaskScreen";
import type { Task, TaskPage } from "@/features/discovery/types";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "alice" } }) }));
const blocked = axiosClient.defaults.adapter;
const first: Task = { ...testCard, _count: { attachments: 0 }, status: "ACTIVE", createdAt: "2026-10-23T10:00:00Z", list: { id: testCard.listId, name: "Đang làm", status: "ACTIVE", board: { id: "board", name: "Sản phẩm", status: "ACTIVE", projectId: "project", project: { status: "ACTIVE" } } }, cardMembers: [{ userId: "alice", user: { id: "alice", name: "An", avatar: null } }], cardLabels: [] };
const second: Task = { ...first, id: "00000000-0000-4000-8000-000000000003", title: "Công việc tiếp theo" };
let client = createQueryClient();
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
beforeEach(() => {
  resetApiSession(); client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: { items: [first], nextCursor: null } }));
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function Location() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="url">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Back</button><Link to="/my-work?due=none">No date</Link><Outlet /></>; }
function mount(initial = "/my-work") {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Routes><Route element={<Location />}><Route path="/my-work" element={<TaskScreen />}><Route path="boards/:boardId/cards/:cardId" element={<h2>Chi tiết đã mở</h2>} /></Route></Route></Routes></MemoryRouter></QueryClientProvider>);
}

it("rejects mismatched board, malformed members, duplicate rows and foreign cursors", () => {
  const page: TaskPage = { items: [first], nextCursor: first.id };
  expect(readTaskPage(page, "board")).toBe(page);
  expect(() => readTaskPage(page, "other-board")).toThrow();
  expect(() => readTaskPage({ ...page, items: [first, first] })).toThrow();
  expect(() => readTaskPage({ ...page, nextCursor: second.id })).toThrow();
  expect(() => readTaskPage({ ...page, items: [{ ...first, cardMembers: [{ userId: "bob", user: { id: "alice", name: "An", avatar: null } }] }] })).toThrow();
});
it("binds My work to /users/me, preserves false, sends page cursors and resets them on a new filter", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { items: [config.url?.includes("cursor=") ? second : first], nextCursor: config.url?.includes("cursor=") ? null : first.id } }));
  const hook = renderHook(({ keyword }) => useTaskSearch({ keyword, isComplete: false }), { wrapper, initialProps: { keyword: "first" } });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(adapter.mock.calls[0][0].url).toBe("/users/me/cards?keyword=first&isComplete=false&limit=20");
  await act(async () => { await hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(2));
  expect(adapter.mock.calls[1][0].url).toContain(`cursor=${first.id}`);
  hook.rerender({ keyword: "second" });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.data?.pages).toHaveLength(1);
  expect(adapter.mock.calls.at(-1)![0].url).not.toContain("cursor=");
});
it("cancels a previous filter request and excludes late data after a session reset", async () => {
  const gate = deferred<void>();
  adapter.mockImplementation(async (config) => { if (config.url?.includes("keyword=old")) await gate.promise; return reply(config, { success: true, data: { items: [config.url?.includes("keyword=old") ? first : second], nextCursor: null } }); });
  const hook = renderHook(({ keyword }) => useTaskSearch({ keyword }), { wrapper, initialProps: { keyword: "old" } });
  await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
  const signal = adapter.mock.calls[0][0].signal;
  hook.rerender({ keyword: "new" });
  await waitFor(() => expect(hook.result.current.data?.pages[0].items[0].id).toBe(second.id));
  expect(signal?.aborted).toBe(true);
  await act(async () => gate.resolve());
  expect(hook.result.current.data?.pages[0].items[0].id).toBe(second.id);
  const late = deferred<void>(); adapter.mockImplementation(async (config) => { await late.promise; return reply(config, { success: true, data: { items: [first], nextCursor: null } }); });
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.refetch(); });
  await waitFor(() => expect(adapter).toHaveBeenCalledTimes(3));
  resetApiSession(); await act(async () => { late.resolve(); await pending; });
  expect(hook.result.current.data?.pages[0].items[0].id).toBe(second.id);
});
it("restarts from the first page when a cursor becomes invalid after results change", async () => {
  adapter.mockImplementation(async (config) => {
    if (config.url?.includes("cursor=")) throw httpError(config, 422);
    return reply(config, { success: true, data: { items: [first], nextCursor: first.id } });
  });
  mount(); await screen.findByRole("link", { name: first.title });
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải thêm công việc" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Danh sách công việc đã thay đổi"));
  expect(screen.getByRole("link", { name: first.title })).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải lại từ đầu" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(adapter.mock.calls.at(-1)![0].url).not.toContain("cursor=");
});
it("retains loaded rows on a next-page failure and retries the same cursor", async () => {
  let failed = false;
  adapter.mockImplementation(async (config) => {
    if (config.url?.includes("cursor=")) {
      if (!failed) { failed = true; throw httpError(config, 500); }
      return reply(config, { success: true, data: { items: [second], nextCursor: null } });
    }
    return reply(config, { success: true, data: { items: [first], nextCursor: first.id } });
  });
  mount(); await screen.findByRole("link", { name: first.title });
  const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Tải thêm công việc" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("trang tiếp theo"));
  expect(screen.getByRole("link", { name: first.title })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("link", { name: second.title })).toBeTruthy();
  expect(adapter.mock.calls.at(-1)![0].url).toBe(adapter.mock.calls.at(-2)![0].url);
});
it("debounces keywords without losing input focus, preserves filters in card links and restores Back", async () => {
  mount("/my-work?isComplete=false");
  await screen.findByRole("link", { name: first.title });
  const user = userEvent.setup(); const input = screen.getByRole("searchbox");
  await user.type(input, "Nghiệm thu");
  expect(adapter.mock.calls).toHaveLength(1);
  await waitFor(() => expect(screen.getByTestId("url").textContent).toContain("keyword=Nghi%E1%BB%87m+thu"));
  expect(document.activeElement).toBe(input);
  expect(screen.getByTestId("url").textContent).toContain("isComplete=false");
  await user.click(await screen.findByRole("link", { name: first.title }));
  expect(await screen.findByRole("heading", { name: "Chi tiết đã mở" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByTestId("url").textContent).toBe("/my-work?isComplete=false&keyword=Nghi%E1%BB%87m+thu");
  expect(input).toHaveProperty("value", "Nghiệm thu");
  await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
  await new Promise((done) => setTimeout(done, 400));
  expect(input).toHaveProperty("value", "");
  expect(screen.getByTestId("url").textContent).toBe("/my-work");
});
it("rejects malformed URL filters before requesting and clears them explicitly", async () => {
  mount("/my-work?isComplete=0");
  expect(screen.getByRole("alert").textContent).toContain("không hợp lệ");
  expect(adapter).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
  expect(await screen.findByRole("link", { name: first.title })).toBeTruthy();
});
it("keeps a single due filter selected and supports keyboard navigation", async () => {
  mount(); await screen.findByRole("link", { name: first.title });
  const user = userEvent.setup();
  const overdue = screen.getByRole("radio", { name: "Quá hạn" });
  await user.click(overdue);
  await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/my-work?due=overdue"));
  await user.click(overdue);
  expect(overdue.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByTestId("url").textContent).toBe("/my-work?due=overdue");
  overdue.focus(); await user.keyboard("{ArrowRight}");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Trong 24 giờ" })));
  await user.keyboard(" ");
  await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/my-work?due=soon"));
});
it("completion uses explicit true, resets discovery pages and removes a row from an incomplete filter", async () => {
  let complete = false;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch") { complete = JSON.parse(config.data).isComplete; return reply(config, { success: true, data: { ...first, isComplete: complete } }); }
    return reply(config, { success: true, data: { items: complete ? [] : [first], nextCursor: null } });
  });
  mount("/my-work?isComplete=false");
  const button = await screen.findByRole("button", { name: `Hoàn thành ${first.title}` });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByRole("heading", { name: "Không có thẻ khớp bộ lọc" });
  expect(adapter.mock.calls.filter(([config]) => config.method === "patch")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: first.title })).toBeNull();
  expect(screen.getByText(`Đã hoàn thành “${first.title}”.`)).toBeTruthy();
});
it("a failed mutation keeps the row and its real completion state", async () => {
  adapter.mockImplementation(async (config) => { if (config.method === "patch") throw httpError(config, 403, "Quyền đã thay đổi"); return reply(config, { success: true, data: { items: [first], nextCursor: null } }); });
  mount(); const button = await screen.findByRole("button", { name: `Hoàn thành ${first.title}` });
  await userEvent.setup().click(button);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Quyền đã thay đổi");
  expect(button.getAttribute("aria-pressed")).toBe("false");
});
it("does not expose cached rows after a permission failure", async () => {
  mount(); await screen.findByRole("link", { name: first.title });
  adapter.mockImplementation(async (config) => { throw httpError(config, 403); });
  await act(async () => { await client.invalidateQueries({ queryKey: ["discovery", getSessionVersion(), "alice"] }); });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: first.title })).toBeNull();
  expect(Array.from(screen.getByRole("region", { name: "Tổng quan công việc đã tải" }).querySelectorAll("dd"), (node) => node.textContent)).toEqual(["—", "—", "—", "—"]);
});

it("summarizes only the loaded results and updates the summary when filters change", async () => {
  const overdue = { ...first, isOverdue: true, isComplete: false };
  const complete = { ...second, isOverdue: true, isComplete: true };
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { items: config.url?.includes("due=none") ? [{ ...overdue, dueDate: null, isOverdue: false }] : [overdue, complete], nextCursor: null } }));
  mount();
  await screen.findByRole("link", { name: first.title });
  const summary = screen.getByRole("region", { name: "Tổng quan công việc đã tải" });
  const counts = () => Array.from(summary.querySelectorAll("dd"), (node) => node.textContent);
  expect(counts()).toEqual(["2", "1", "1", "1"]);
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "No date" }));
  await waitFor(() => expect(counts()).toEqual(["1", "1", "0", "0"]));
  expect(screen.getByTestId("url").textContent).toBe("/my-work?due=none");
});
it("does not mix board scopes and resets all cursor pages after a board write", async () => {
  const hook = renderHook(() => ({ query: useTaskSearch({}, "board"), actions: useCardActions("board", first.id) }), { wrapper });
  adapter.mockImplementation(async (config) => config.method === "patch" ? reply(config, { success: true, data: first }) : reply(config, { success: true, data: { items: [first], nextCursor: null } }));
  await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  expect(adapter.mock.calls[0][0].url).toBe("/boards/board/cards?limit=20");
  await act(async () => { await hook.result.current.actions.update({ isComplete: false }); });
  expect(adapter.mock.calls.filter(([config]) => config.url === "/boards/board/cards?limit=20").length).toBe(2);
});
