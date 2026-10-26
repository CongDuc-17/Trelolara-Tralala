import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { AxiosAdapter } from "axios";
import { Board } from "@/pages/Board";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { deferred, httpError, reply } from "../../../support/helpers";
import { useBoardActions } from "@/features/boards/useBoardActions";
import { boardQueue } from "@/features/boards/boardQueue";
import { getSessionVersion } from "@/lib/apiClient";

import type { List } from "@/features/boards/types";
import type { CardListDto } from "@/features/cards/types";
import { CreateCard } from "@/components/cards/CreateCard";
import { CreateList } from "@/components/lists/CreateList";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "alice", name: "An" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));
const blocked = axiosClient.defaults.adapter;
let client = createQueryClient();
let lists: List[];
let cards: CardListDto[];
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
function row(id: string, listId: string, position: number): CardListDto {
  return { id, listId, position, title: id, description: null, status: "ACTIVE", dueDate: null, isComplete: false, isOverdue: false, reminderMinutesBefore: null, cardMembers: [], cardLabels: [], checklists: [], _count: { comments: 0 } };
}

beforeEach(() => {
  resetApiSession(); client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  lists = [{ id: "l1", boardId: "board", name: "List Một", position: 1, status: "ACTIVE" }, { id: "l2", boardId: "board", name: "List Hai", position: 2, status: "ACTIVE" }];
  cards = [row("c1", "l1", 10), row("c2", "l1", 20), row("c3", "l2", 10), row("c4", "l2", 20)];
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    if (config.url === "/boards/board") return reply(config, { success: true, data: { id: "board", projectId: "project", name: "Bảng kiểm thử", status: "ACTIVE" } });
    if (config.url === "/boards/board/lists") return reply(config, { success: true, data: structuredClone(lists) });
    if (config.method === "get" && /^\/lists\/[^/]+\/cards$/.test(config.url ?? "")) return reply(config, { success: true, data: structuredClone(cards.filter((card) => card.listId === config.url?.split("/")[2])) });
    if (config.method === "get" && /^\/cards\/[^/]+$/.test(config.url ?? "")) return reply(config, { success: true, data: structuredClone(cards.find((card) => card.id === config.url?.split("/")[2])) });
    throw new Error(`Unexpected ${config.method} ${config.url}`);
  });
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/boards/board"]}><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}
async function openBoard() {
  const view = render(<Routes><Route path="/boards/:boardId" element={<Board />} /></Routes>, { wrapper });
  await screen.findByText("c1"); await screen.findByText("c3"); return view;
}
function patches() { return adapter.mock.calls.map(([config]) => config).filter((config) => config.method === "patch"); }

it("completes and reopens directly on a card without opening it or duplicating a pending write", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch" && config.url === "/cards/c1") {
      await gate.promise;
      cards[0].isComplete = JSON.parse(config.data).isComplete;
      return reply(config, { success: true, data: structuredClone(cards[0]) });
    }
    return base(config);
  });
  await openBoard();
  const checkbox = screen.getByRole("checkbox", { name: "Hoàn thành c1" });
  fireEvent.click(checkbox); fireEvent.click(checkbox);
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(checkbox).toHaveProperty("disabled", true);
  await act(async () => { gate.resolve(); });
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Mở lại c1" }).getAttribute("data-state")).toBe("checked"));
  expect(JSON.parse(patches()[0].data)).toEqual({ isComplete: true });
  expect(screen.getByRole("region", { name: "List Một" })).toBeTruthy();
  checkbox.focus(); await userEvent.setup().keyboard(" ");
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Hoàn thành c1" }).getAttribute("data-state")).toBe("unchecked"));
  expect(JSON.parse(patches()[1].data)).toEqual({ isComplete: false });
});

it("keeps the actual completion state and shows an error when a card update fails", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch" && config.url === "/cards/c1") throw httpError(config, 409, "Không thể cập nhật thẻ");
    return base(config);
  });
  await openBoard();
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Hoàn thành c1" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Không thể cập nhật thẻ");
  const checkbox = screen.getByRole("checkbox", { name: "Hoàn thành c1" });
  expect(checkbox.getAttribute("data-state")).toBe("unchecked");
  expect(checkbox).toHaveProperty("disabled", false);
});

it("uses only destination siblings and reloads server positions after a rebalance", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/cards/c1/move") {
      cards.find((card) => card.id === "c1")!.listId = "l2";
      cards.find((card) => card.id === "c1")!.position = -500;
      cards.find((card) => card.id === "c3")!.position = 8700;
      cards.find((card) => card.id === "c4")!.position = 10000;
      return reply(config, { success: true, data: { id: "c1", listId: "l2", title: "c1", description: null, position: -500, status: "ACTIVE" } });
    }
    return base(config);
  });
  await openBoard();
  const hook = renderHook(() => useBoardActions("board"), { wrapper });
  await act(async () => { await hook.result.current.moveCard("c1", "l2", "c3", "top"); });
  expect(JSON.parse(patches()[0].data)).toEqual({ targetListId: "l2", afterCardId: "c3" });
  await waitFor(() => expect(within(screen.getByRole("region", { name: "List Hai" })).getAllByText(/^c[134]$/).map((node) => node.textContent)).toEqual(["c1", "c3", "c4"]));
  expect(within(screen.getByRole("region", { name: "List Một" })).queryByText("c1")).toBeNull();
});

it("serializes two overlapping moves and computes the second from the current server list", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!; let moves = 0;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/cards/c1/move") {
      moves++;
      if (moves === 1) await gate.promise;
      const card = cards.find((card) => card.id === "c1")!; card.listId = "l2"; card.position = moves === 1 ? -50 : 9999;
      return reply(config, { success: true, data: { ...card, cardMembers: undefined, cardLabels: undefined, checklists: undefined } });
    }
    return base(config);
  });
  await openBoard();
  const first = renderHook(() => useBoardActions("board"), { wrapper });
  const second = renderHook(() => useBoardActions("board"), { wrapper });
  let one!: Promise<unknown>; let two!: Promise<unknown>;
  act(() => { one = first.result.current.moveCard("c1", "l2", "c3", "top"); two = second.result.current.moveCard("c1", "l2", "c4", "bottom"); });
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(moves).toBe(1);
  await act(async () => { gate.resolve(); await Promise.all([one, two]); });
  expect(patches()).toHaveLength(2);
  expect(JSON.parse(patches()[1].data)).toEqual({ targetListId: "l2", beforeCardId: "c4" });
});

it("continues the queue after a failed move without rolling back a later successful move", async () => {
  const base = adapter.getMockImplementation()!; let moves = 0;
  adapter.mockImplementation(async (config) => {
    if (config.url?.endsWith("/move")) {
      if (++moves === 1) throw httpError(config, 409, "Neighbor changed");
      const card = cards.find((card) => card.id === "c1")!; card.listId = "l2"; card.position = 999;
      return reply(config, { success: true, data: card });
    }
    return base(config);
  });
  await openBoard();
  const hook = renderHook(() => useBoardActions("board"), { wrapper });
  let results!: PromiseSettledResult<unknown>[];
  await act(async () => { results = await Promise.allSettled([hook.result.current.moveCard("c1", "l2", "c3", "top"), hook.result.current.moveCard("c1", "l2")]); });
  expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
  expect(await within(screen.getByRole("region", { name: "List Hai" })).findByText("c1")).toBeTruthy();
});

it("projects a slow move immediately, holds background reads and rolls back only the failed intention", async () => {
  const firstGate = deferred<void>(); const secondGate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/cards/c1/move") { await firstGate.promise; throw httpError(config, 409, "Changed elsewhere"); }
    if (config.url === "/cards/c2/move") { await secondGate.promise; const card = cards.find((card) => card.id === "c2")!; card.listId = "l2"; card.position = 999; return reply(config, { success: true, data: card }); }
    return base(config);
  });
  await openBoard(); const hook = renderHook(() => useBoardActions("board"), { wrapper });
  let one!: Promise<unknown>; let two!: Promise<unknown>;
  act(() => { one = hook.result.current.moveCard("c1", "l2").catch((error) => error); two = hook.result.current.moveCard("c2", "l2"); });
  await waitFor(() => expect(within(screen.getByRole("region", { name: "List Hai" })).getByRole("button", { name: "c2" })).toBeTruthy());
  expect(within(screen.getByRole("region", { name: "List Hai" })).getByRole("button", { name: "c1" })).toBeTruthy();
  let refetch!: Promise<void>;
  act(() => { refetch = client.refetchQueries({ queryKey: ["kanban"] }); });
  await act(async () => { firstGate.resolve(); await one; });
  await waitFor(() => expect(patches()).toHaveLength(2));
  expect(within(screen.getByRole("region", { name: "List Một" })).getByRole("button", { name: "c1" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "List Hai" })).getByRole("button", { name: "c2" })).toBeTruthy();
  await act(async () => { secondGate.resolve(); await two; await refetch; });
  expect(within(screen.getByRole("region", { name: "List Hai" })).getByRole("button", { name: "c2" })).toBeTruthy();
  expect(patches()).toHaveLength(2);
});

it("stops queued writes when board permission is revoked", async () => {
  const gate = deferred<void>(); const started = vi.fn(async () => { await gate.promise; }); const never = vi.fn(async () => {});
  const queue = boardQueue(client, ["kanban", getSessionVersion(), "alice", "board"]);
  const first = queue.enqueue(started).catch((error) => error);
  const second = queue.enqueue(never).catch((error) => error);
  await waitFor(() => expect(started).toHaveBeenCalledOnce());
  queue.revoke(); gate.resolve(); await Promise.all([first, second]);
  expect(never).not.toHaveBeenCalled();
});

it("does not hide a list or its cards while an archive is pending or rejected", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/lists/l1/archive") { await gate.promise; throw httpError(config, 403, "Archive denied"); }
    return base(config);
  });
  await openBoard();
  const hook = renderHook(() => useBoardActions("board"), { wrapper });
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.lifecycle("lists", "l1", "archive").catch((error) => error); });
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(screen.getByRole("region", { name: "List Một" })).toBeTruthy();
  await act(async () => { gate.resolve(); await pending; });
  expect(within(screen.getByRole("region", { name: "List Một" })).getByText("c1")).toBeTruthy();
});

it("keeps archived cards in the archive when restoring under an archived parent fails", async () => {
  lists[0].status = "ARCHIVED"; cards[0].status = "ARCHIVED";
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/cards/c1/restore") throw httpError(config, 409, "List or its parent is read-only"); return base(config); });
  render(<Routes><Route path="/boards/:boardId" element={<Board />} /></Routes>, { wrapper });
  await screen.findByText("c3");
  const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Mục đã lưu trữ" }));
  await user.click(await screen.findByRole("button", { name: "Khôi phục thẻ c1" }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Khôi phục thẻ c1" })).toHaveProperty("disabled", false));
  expect(screen.getByText("c1")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "List Một" })).toBeNull();
});

it("renders independent card query failures without hiding another list's data", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/lists/l1/cards") throw httpError(config, 500, "Cards unavailable"); return base(config); });
  render(<Routes><Route path="/boards/:boardId" element={<Board />} /></Routes>, { wrapper });
  expect(await screen.findByText("c3")).toBeTruthy();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Cards unavailable"));
});

it("uses server order after moving a list", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/lists/l2/move") { lists[1].position = -100; return reply(config, { success: true, data: lists[1] }); } return base(config); });
  await openBoard(); const hook = renderHook(() => useBoardActions("board"), { wrapper });
  await act(async () => { await hook.result.current.moveList("l2", "l1"); });
  expect(JSON.parse(patches()[0].data)).toEqual({ afterListId: "l1" });
  await waitFor(() => expect(within(screen.getByRole("region", { name: "Các danh sách của bảng" })).getAllByRole("region").map((node) => node.getAttribute("aria-labelledby"))).toEqual(["column-l2-title", "column-l1-title"]));
});

it("renames a list from its keyboard menu and retains the input after a server failure", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/lists/l1/update" && config.method === "patch") throw httpError(config, 403, "Rename denied"); return base(config); });
  await openBoard(); const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Tùy chọn danh sách List Một" });
  trigger.focus(); await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: "Đổi tên danh sách" }));
  const input = screen.getByRole("textbox", { name: "Tên danh sách" });
  expect(document.activeElement).toBe(input);
  await user.clear(input); await user.type(input, "Tên còn nháp{Enter}");
  await waitFor(() => expect(patches()).toHaveLength(1));
  await waitFor(() => expect(input).toHaveProperty("disabled", false));
  expect(input).toHaveProperty("value", "Tên còn nháp");
  expect(JSON.parse(patches()[0].data)).toEqual({ name: "Tên còn nháp" });
});

it.each(["card", "list"])("lifts a %s with Space and cancels with Escape without writing", async (kind) => {
  await openBoard();
  const user = userEvent.setup();
  const handle = screen.getByRole("button", { name: kind === "card" ? "c1" : "Kéo danh sách List Một" });
  handle.focus(); await user.keyboard(" ");
  await waitFor(() => expect(document.querySelector("[data-board-dragging]")).toBeTruthy());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.querySelector("[data-board-dragging]")).toBeNull());
  expect(patches()).toHaveLength(0);
});
it("moves a list through the menu using the same neighbor contract", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/lists/l2/move") { lists[1].position = -100; return reply(config, { success: true, data: lists[1] }); } return base(config); });
  await openBoard(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tùy chọn danh sách List Hai" }));
  await user.click(screen.getByRole("menuitem", { name: "Di chuyển sang trái" }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(JSON.parse(patches()[0].data)).toEqual({ afterListId: "l1" });
});

it("keeps a list visible when archiving from its menu is denied", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/lists/l1/archive") throw httpError(config, 403, "Archive denied"); return base(config); });
  await openBoard(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tùy chọn danh sách List Một" }));
  await user.click(screen.getByRole("menuitem", { name: "Lưu trữ danh sách" }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(screen.getByRole("region", { name: "List Một" })).toBeTruthy();
});

it("opens a card route with Enter", async () => {
  render(<Routes><Route path="/boards/:boardId" element={<Board />}><Route path="cards/:cardId" element={<h2>Thẻ đã mở</h2>} /></Route></Routes>, { wrapper });
  const button = await screen.findByRole("button", { name: "c1" }); button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "Thẻ đã mở" })).toBeTruthy();
});

it("prevents queued writes from an expired session", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/cards/c1/archive") { await gate.promise; return reply(config, { success: true, data: {} }); } return base(config); });
  const hook = renderHook(() => useBoardActions("board"), { wrapper });
  let one!: Promise<unknown>; let two!: Promise<unknown>;
  act(() => { one = hook.result.current.lifecycle("cards", "c1", "archive").catch((error) => error); two = hook.result.current.lifecycle("cards", "c2", "archive").catch((error) => error); });
  await waitFor(() => expect(patches()).toHaveLength(1));
  resetApiSession();
  await act(async () => { gate.resolve(); await Promise.all([one, two]); });
  expect(patches()).toHaveLength(1);
});

it("keeps a late response from board A out of board B after navigation", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/lists/l1/cards") await gate.promise;
    if (config.url === "/boards/other") return reply(config, { success: true, data: { id: "other", name: "Bảng B", projectId: "p", status: "ACTIVE" } });
    if (config.url === "/boards/other/lists") return reply(config, { success: true, data: [{ id: "lb", boardId: "other", name: "List B", position: 1, status: "ACTIVE" }] });
    if (config.url === "/lists/lb/cards") return reply(config, { success: true, data: [row("Thẻ của B", "lb", 1)] });
    return base(config);
  });
  function SwitchBoard() { const navigate = useNavigate(); return <button onClick={() => navigate("/boards/other")}>Mở bảng B</button>; }
  render(<><SwitchBoard /><Routes><Route path="/boards/:boardId" element={<Board />} /></Routes></>, { wrapper });
  await waitFor(() => expect(adapter.mock.calls.some(([config]) => config.url === "/lists/l1/cards")).toBe(true));
  await userEvent.setup().click(screen.getByRole("button", { name: "Mở bảng B" }));
  expect(await screen.findByText("Thẻ của B")).toBeTruthy();
  await act(async () => gate.resolve());
  expect(screen.queryByText("c1")).toBeNull();
  expect(screen.getByText("Thẻ của B")).toBeTruthy();
});

it("preserves a failed card creation draft and blocks duplicate Enter submits", async () => {
  const gate = deferred<void>();
  const create = vi.fn(async () => { await gate.promise; throw new Error("Cannot create"); });
  render(<CreateCard listId="l1" onCardCreated={create} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thêm thẻ" }));
  await user.type(screen.getByPlaceholderText("Nhập tiêu đề thẻ…"), "Bản nháp{Enter}{Enter}");
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByPlaceholderText("Nhập tiêu đề thẻ…")).toHaveProperty("value", "Bản nháp");
});

it("preserves a failed list creation draft", async () => {
  render(<CreateList boardId="board" createList={vi.fn(async () => { throw new Error("Cannot create"); })} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Thêm danh sách"));
  await user.type(screen.getByLabelText("Tên danh sách"), "Danh sách nháp");
  await user.click(screen.getByRole("button", { name: "Tạo" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByLabelText("Tên danh sách")).toHaveProperty("value", "Danh sách nháp");
});

it.each([false, true])("requires named confirmation and keeps the archive entry on delete failure (success=%s)", async (success) => {
  cards[0].status = "ARCHIVED";
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "delete") {
      if (!success) throw httpError(config, 403, "Delete denied");
      cards = cards.filter((card) => card.id !== "c1");
      return reply(config, { success: true, data: null });
    }
    return base(config);
  });
  render(<Routes><Route path="/boards/:boardId" element={<Board />} /></Routes>, { wrapper });
  await screen.findByText("c3"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mục đã lưu trữ" }));
  await user.click(await screen.findByRole("button", { name: "Xóa thẻ c1" }));
  expect(screen.getByRole("heading", { name: "Xóa c1?" })).toBeTruthy();
  expect(adapter.mock.calls.some(([config]) => config.method === "delete")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Xóa vĩnh viễn" }));
  if (success) await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  else {
    await waitFor(() => expect(screen.getByRole("button", { name: "Xóa vĩnh viễn" })).toHaveProperty("disabled", false));
    expect(screen.getByRole("heading", { name: "Xóa c1?" })).toBeTruthy();
    expect(cards.some((card) => card.id === "c1")).toBe(true);
  }
});
