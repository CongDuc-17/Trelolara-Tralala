import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import i18n from "@/app/i18n";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { testCard } from "../../../support/fixtures";
import { httpError, reply } from "../../../support/helpers";
import type { Task } from "@/features/discovery/types";
import { TaskSchedule } from "@/components/layout/TaskSchedule";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "alice" } }) }));
const blocked = axiosClient.defaults.adapter;
const now = new Date();
const anotherDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() < 28 ? now.getDate() + 1 : now.getDate() - 1, 16);
const task: Task = { ...testCard, _count: { attachments: 0 }, status: "ACTIVE", dueDate: now.toISOString(), createdAt: now.toISOString(), list: { id: testCard.listId, name: "Đang làm", status: "ACTIVE", board: { id: "board", name: "Sản phẩm", status: "ACTIVE", projectId: "project", project: { status: "ACTIVE" } } }, cardMembers: [], cardLabels: [] };
let client = createQueryClient();
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
beforeEach(() => {
  resetApiSession(); client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: { items: [task], nextCursor: null } }));
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });
function mount(enabled = true) { return render(<QueryClientProvider client={client}><MemoryRouter><TaskSchedule enabled={enabled} /></MemoryRouter></QueryClientProvider>); }
function day(date: Date) { return document.querySelector<HTMLButtonElement>(`button[data-day="${date.toLocaleDateString("en-CA")}"]`)!; }

it("defers the schedule request until its panel opens", () => {
  mount(false);
  expect(adapter).not.toHaveBeenCalled();
});

it("marks local due days, explains partial data, loads the next page and opens the selected day's card", async () => {
  const second = { ...task, id: "second", title: "Việc ngày khác", dueDate: anotherDay.toISOString() };
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: config.url?.includes("cursor=") ? { items: [second], nextCursor: null } : { items: [task, { ...task, id: "complete", isComplete: true }, { ...task, id: "no-date", dueDate: null }], nextCursor: "no-date" } }));
  mount();
  expect(await screen.findByRole("link", { name: new RegExp(task.title) })).toHaveProperty("href", expect.stringContaining(`/my-work/boards/board/cards/${task.id}`));
  expect(day(now).parentElement?.classList.contains("calendar-has-task")).toBe(true);
  expect(day(now).getAttribute("aria-label")).toContain("1 công việc đến hạn");
  expect(screen.getByText(/Lịch đang hiển thị các công việc đã tải/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tải thêm công việc" }));
  await waitFor(() => expect(day(anotherDay).parentElement?.classList.contains("calendar-has-task")).toBe(true));
  fireEvent.click(day(anotherDay));
  expect(await screen.findByRole("link", { name: /Việc ngày khác/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: new RegExp(task.title) })).toBeNull();
  expect(screen.queryByText(/Lịch đang hiển thị các công việc đã tải/)).toBeNull();
  expect(adapter.mock.calls[0][0].url).toContain("isComplete=false");
});

it("hides stale task links and marks after access is denied, then retries", async () => {
  mount();
  await screen.findByRole("link", { name: new RegExp(task.title) });
  adapter.mockImplementationOnce(async (config) => { throw httpError(config, 403, "Denied"); });
  await act(async () => { await client.invalidateQueries({ queryKey: ["discovery"] }); });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: new RegExp(task.title) })).toBeNull();
  expect(day(now).parentElement?.classList.contains("calendar-has-task")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("link", { name: new RegExp(task.title) })).toBeTruthy();
});

it("keeps the chosen date when changing language and returns to today", async () => {
  mount(); await screen.findByRole("link", { name: new RegExp(task.title) });
  fireEvent.click(day(anotherDay));
  expect(screen.getByText("Không có công việc đến hạn trong ngày này.")).toBeTruthy();
  await act(async () => { await i18n.changeLanguage("en"); });
  expect(day(anotherDay).dataset.selectedSingle).toBe("true");
  expect(screen.getByRole("button", { name: "Next month" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(await screen.findByRole("link", { name: new RegExp(task.title) })).toBeTruthy();
});
