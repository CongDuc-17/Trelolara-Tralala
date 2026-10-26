import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "@/app/i18n";
import { AxiosError, type AxiosAdapter } from "axios";
import { CardDetail } from "@/pages/CardDetail";
import { axiosClient, getSessionVersion, resetApiSession } from "@/lib/apiClient";
import { createQueryClient } from "@/app/queryClient";
import { commentResponse, testCard } from "../../support/fixtures";
import { deferred, httpError, reply } from "../../support/helpers";
import type { CardDetailDto } from "@/features/cards/types";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "00000000-0000-4000-8000-000000000004", name: "An" } }) }));
const blocked = axiosClient.defaults.adapter;
let client = createQueryClient();
let data: CardDetailDto;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
const path = `/boards/board/cards/${testCard.id}`;

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  resetApiSession(); client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  data = structuredClone(testCard);
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    if (config.url?.startsWith(`/cards/${testCard.id}?`)) return reply(config, { success: true, data: structuredClone(data) });
    if (config.url === "/boards/board/lists") return reply(config, { success: true, data: [{ id: data.listId, name: "List", boardId: "board", status: "ACTIVE", position: 1 }] });
    if (config.url === "/boards/board/labels") return reply(config, { success: true, data: [{ id: "label", name: "Gấp", color: "#ef4444" }] });
    if (config.url === `/cards/${testCard.id}/comments`) {
      const comment = commentResponse.data;
      data.comments = [{ id: comment.commentId, content: comment.content, userId: comment.user.id, userName: comment.user.name, userAvatar: null, createdAt: comment.createdAt, updatedAt: comment.updatedAt }]; data.commentCount = 1;
      return reply(config, commentResponse);
    }
    if (config.method === "patch" && config.url === `/cards/${testCard.id}`) {
      Object.assign(data, JSON.parse(config.data));
      return reply(config, { success: true, data: { id: data.id, title: data.title, description: data.description, listId: data.listId, position: data.position, status: "ACTIVE", dueDate: data.dueDate, isComplete: data.isComplete, reminderMinutesBefore: data.reminderMinutesBefore } });
    }
    throw new Error(`Unexpected ${config.method} ${config.url}`);
  });
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });

function open() {
  const view = render(<ThemeProvider attribute="class" storageKey={THEME_STORAGE_KEY} defaultTheme="light"><MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><Routes>
    <Route path="/boards/:boardId/cards/:cardId" element={<CardDetail />} />
  </Routes></QueryClientProvider></MemoryRouter></ThemeProvider>);
  return view;
}

it("hides cached card content if a later read loses permission outside the board screen", async () => {
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url?.startsWith(`/cards/${testCard.id}?`)) throw httpError(config, 403); return base(config); });
  await act(async () => { await client.invalidateQueries({ queryKey: ["kanban"] }); });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByLabelText("Tiêu đề")).toBeNull();
  expect(screen.queryByLabelText("Hạn hoàn thành")).toBeNull();
});

it("saves a device-local deadline and reminder together, then clears only the date", async () => {
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText("Hạn hoàn thành"), { target: { value: "2026-10-24T17:30" } });
  screen.getByRole("combobox", { name: "Nhắc trong ứng dụng" }).focus();
  await user.keyboard("{ArrowDown}");
  await user.click(await screen.findByRole("option", { name: "Trước 1 giờ" }));
  await user.click(screen.getByRole("button", { name: "Lưu hạn và nhắc việc" }));
  await waitFor(() => expect(data.reminderMinutesBefore).toBe(60));
  const patch = adapter.mock.calls.find(([config]) => config.method === "patch")![0];
  expect(JSON.parse(patch.data)).toEqual({ dueDate: new Date(2026, 9, 24, 17, 30).toISOString(), reminderMinutesBefore: 60 });
  await user.click(screen.getByRole("button", { name: "Xóa hạn" }));
  await user.click(screen.getByRole("button", { name: "Lưu hạn và nhắc việc" }));
  await waitFor(() => expect(data.dueDate).toBeNull());
  expect(JSON.parse(adapter.mock.calls.filter(([config]) => config.method === "patch").at(-1)![0].data)).toEqual({ dueDate: null });
  expect(data.reminderMinutesBefore).toBe(60);
  expect(await screen.findByText("Đã giữ tùy chọn nhắc; tạm dừng khi chưa có hạn.")).toBeTruthy();
});

it("completes and reopens independently, keeping deadline and content drafts", async () => {
  data.dueDate = "2026-10-24T10:00:00Z"; data.reminderMinutesBefore = 1440;
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  fireEvent.change(screen.getByLabelText("Hạn hoàn thành"), { target: { value: "2026-10-25T09:00" } });
  await userEvent.setup().click(screen.getByRole("button", { name: "Hoàn thành" }));
  await waitFor(() => expect(data.isComplete).toBe(true));
  expect(data.dueDate).toBe("2026-10-24T10:00:00Z");
  expect(screen.getByLabelText("Hạn hoàn thành")).toHaveProperty("value", "2026-10-25T09:00");
  expect(JSON.parse(adapter.mock.calls.find(([config]) => config.method === "patch")![0].data)).toEqual({ isComplete: true });
  await userEvent.setup().click(screen.getByRole("button", { name: "Mở lại" }));
  await waitFor(() => expect(data.isComplete).toBe(false));
  expect(JSON.parse(adapter.mock.calls.filter(([config]) => config.method === "patch").at(-1)![0].data)).toEqual({ isComplete: false });
});

it("keeps the schedule draft after a rejected save and disables reminder choices without a date", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.method === "patch") throw httpError(config, 409, "Thẻ đã lưu trữ"); return base(config); });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  screen.getByRole("combobox", { name: "Nhắc trong ứng dụng" }).focus();
  await user.keyboard("{ArrowDown}");
  expect((await screen.findByRole("option", { name: "Trước 1 giờ" })).getAttribute("data-disabled")).toBe("");
  await user.keyboard("{Escape}");
  fireEvent.change(screen.getByLabelText("Hạn hoàn thành"), { target: { value: "2026-10-25T09:00" } });
  await user.click(screen.getByRole("button", { name: "Lưu hạn và nhắc việc" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Thẻ đã lưu trữ");
  expect(screen.getByLabelText("Hạn hoàn thành")).toHaveProperty("value", "2026-10-25T09:00");
});

it("loads uncached detail with flattened relationships without writing to the board's list cache", async () => {
  data.members = [{ id: "relation", userId: "user", userName: "An", userAvatar: null }];
  data.labels = [{ id: "label", name: "Gấp", color: "#ef4444" }];
  data.checklists = [{ id: "check", title: "Kiểm tra", checklistItems: [{ id: "item", title: "Nghiệm thu", completed: true }] }];
  const listKey = ["kanban", getSessionVersion(), "00000000-0000-4000-8000-000000000004", "board", "cards", data.listId];
  client.setQueryData(listKey, [{ id: "other-card", title: "Thẻ khác" }]);
  open();
  await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  expect(screen.getByText("Gấp")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Hoàn thành Nghiệm thu" }).getAttribute("data-state")).toBe("checked");
  expect(client.getQueryData(listKey)).toEqual([{ id: "other-card", title: "Thẻ khác" }]);
});

it("adds the returned comment and preserves its canonical ID, author and cardId", async () => {
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Viết bình luận…"), commentResponse.data.content + "{Enter}");
  expect(await screen.findByText(commentResponse.data.content)).toBeTruthy();
  const detail = client.getQueryData<CardDetailDto>(["kanban", getSessionVersion(), commentResponse.data.user.id, "board", "detail", testCard.id]);
  expect(detail?.comments?.[0]).toMatchObject({ id: commentResponse.data.commentId, userId: commentResponse.data.user.id });
  expect(screen.getByPlaceholderText("Viết bình luận…")).toHaveProperty("value", "");
});

it("keeps comment drafts and does not duplicate a pending submit", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "post") { await gate.promise; throw httpError(config, 403, "Comment denied"); }
    return base(config);
  });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Viết bình luận…"), "Giữ lại bản nháp");
  fireEvent.click(screen.getByRole("button", { name: "Gửi bình luận" })); fireEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.method === "post")).toHaveLength(1));
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Comment denied");
  expect(screen.getByPlaceholderText("Viết bình luận…")).toHaveProperty("value", "Giữ lại bản nháp");
});

it("does not submit whitespace-only comments", async () => {
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  await userEvent.setup().type(screen.getByPlaceholderText("Viết bình luận…"), "   {Enter}");
  expect(adapter.mock.calls.some(([config]) => config.method === "post")).toBe(false);
});

it("saves title and description through the real PATCH contract and clears description with null", async () => {
  data.description = "Mô tả cũ";
  const view = open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Tiêu đề")); await user.type(screen.getByLabelText("Tiêu đề"), "Tên đã lưu");
  await user.clear(screen.getByLabelText("Mô tả"));
  await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await screen.findByRole("heading", { name: "Tên đã lưu" });
  const request = adapter.mock.calls.find(([config]) => config.method === "patch")![0];
  expect(JSON.parse(request.data)).toEqual({ title: "Tên đã lưu", description: null });
  view.unmount(); client.clear(); open();
  await screen.findByRole("heading", { name: "Tên đã lưu" });
  expect(screen.getByLabelText("Mô tả")).toHaveProperty("value", "");
});

it("retains title/description edits after PATCH failure", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.method === "patch") throw httpError(config, 409, "Card is read-only"); return base(config); });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Tiêu đề")); await user.type(screen.getByLabelText("Tiêu đề"), "Tên nháp");
  await user.type(screen.getByLabelText("Mô tả"), "Mô tả nháp");
  await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Card is read-only");
  expect(screen.getByLabelText("Tiêu đề")).toHaveProperty("value", "Tên nháp");
  expect(screen.getByLabelText("Mô tả")).toHaveProperty("value", "Mô tả nháp");
});

it("keeps an item unchanged when its toggle is rejected", async () => {
  data.checklists = [{ id: "check", title: "Danh sách kiểm tra", checklistItems: [{ id: "item", title: "Việc cần làm", completed: false }] }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.method === "patch") throw httpError(config, 403, "Toggle denied"); return base(config); });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Hoàn thành Việc cần làm" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Toggle denied");
  expect(screen.getByRole("checkbox", { name: "Hoàn thành Việc cần làm" }).getAttribute("data-state")).toBe("unchecked");
});

it("shows missing included data as an error instead of an empty successful detail", async () => {
  data.members = undefined;
  open(); expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
});

it("rejects a deep link whose card belongs to another board", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/boards/board/lists"
    ? reply(config, { success: true, data: [{ id: "different-list", boardId: "board", name: "List", status: "ACTIVE", position: 1 }] }) : base(config));
  open();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
});

it("edits its own flat comment through the returned mutation DTO", async () => {
  data.comments = [{ id: "own-comment", content: "Bản cũ", userId: commentResponse.data.user.id, userName: "An", userAvatar: null, createdAt: commentResponse.data.createdAt, updatedAt: commentResponse.data.createdAt }]; data.commentCount = 1;
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/comments/own-comment") {
      data.comments![0].content = "Bản mới";
      return reply(config, { success: true, data: { ...commentResponse.data, commentId: "own-comment", content: "Bản mới" } });
    }
    return base(config);
  });
  open(); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Sửa bình luận" }));
  expect(screen.getByPlaceholderText("Viết bình luận…")).toHaveProperty("value", "Bản cũ");
  await user.clear(screen.getByPlaceholderText("Viết bình luận…")); await user.type(screen.getByPlaceholderText("Viết bình luận…"), "Bản mới");
  await user.click(screen.getByRole("button", { name: "Cập nhật" }));
  expect(await screen.findByText("Bản mới")).toBeTruthy();
  expect(adapter.mock.calls.filter(([config]) => config.method === "patch")).toHaveLength(1);
});

it("reads checklist completed from the included detail after an isCompleted mutation response", async () => {
  data.checklists = [{ id: "check", title: "Danh sách kiểm tra", checklistItems: [] }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/checklists/check" && config.method === "post") {
      data.checklists![0].checklistItems = [{ id: "new-item", title: "Mục mới", completed: false }];
      return reply(config, { success: true, data: { id: "new-item", checklistId: "check", title: "Mục mới", isCompleted: false } });
    }
    return base(config);
  });
  open(); await screen.findByText("Danh sách kiểm tra"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thêm mục kiểm tra" }));
  await user.type(screen.getByPlaceholderText("Nhập việc cần làm…"), "Mục mới{Enter}");
  expect((await screen.findByRole("checkbox", { name: "Hoàn thành Mục mới" })).getAttribute("data-state")).toBe("unchecked");
});

it("does not erase a checklist when its confirmed delete fails", async () => {
  data.checklists = [{ id: "check", title: "Checklist cần giữ", checklistItems: [] }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.method === "delete") throw httpError(config, 403, "Delete denied"); return base(config); });
  open(); await screen.findByText("Checklist cần giữ"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Xóa danh sách kiểm tra Checklist cần giữ" }));
  await user.click(screen.getByRole("button", { name: "Xóa danh sách kiểm tra" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Delete denied");
  expect(data.checklists).toHaveLength(1);
});

it("preserves a selected label when removal fails", async () => {
  data.labels = [{ id: "label", name: "Gấp", color: "#ef4444" }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.method === "delete") throw httpError(config, 403, "Label denied"); return base(config); });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Nhãn của thẻ" }));
  await user.click(screen.getByRole("checkbox"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Label denied");
  expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("checked");
});

it("reuses a newly created label after its attach fails instead of creating another label", async () => {
  const label = { id: "new-label", name: "Nhãn mới", color: "#ef4444" }; let attaches = 0;
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "post" && config.url === "/boards/board/labels") return reply(config, { success: true, data: label });
    if (config.method === "patch" && config.url === "/labels/new-label") return reply(config, { success: true, data: label });
    if (config.method === "post" && config.url === `/cards/${testCard.id}/labels`) {
      if (++attaches === 1) throw httpError(config, 503, "Attach failed");
      data.labels = [label]; return reply(config, { success: true, data: { id: "relation", cardId: data.id, labelId: label.id } });
    }
    return base(config);
  });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Nhãn của thẻ" }));
  await user.click(screen.getByRole("button", { name: "Tạo nhãn mới" }));
  await user.click(screen.getByRole("button", { name: "Chọn màu #ef4444" }));
  await user.type(screen.getByLabelText("Tên nhãn"), label.name);
  await user.click(screen.getByRole("button", { name: "Tạo" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Attach failed"));
  await user.click(screen.getByRole("button", { name: "Tạo" }));
  await waitFor(() => expect(attaches).toBe(2));
  expect(adapter.mock.calls.filter(([config]) => config.method === "post" && config.url === "/boards/board/labels")).toHaveLength(1);
});

it("keeps an assigned member after failure and blocks duplicate removal clicks", async () => {
  data.members = [{ id: "assignment", userId: "assigned", userName: "Người được giao", userAvatar: null }];
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/boards/board/members") return reply(config, { success: true, data: [] });
    if (config.method === "delete") { await gate.promise; throw httpError(config, 403, "Assignment denied"); }
    return base(config);
  });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  await userEvent.setup().click(screen.getByRole("button", { name: "Thêm thành viên vào thẻ" }));
  const remove = screen.getByRole("button", { name: "Xóa Người được giao khỏi thẻ" });
  fireEvent.click(remove); fireEvent.click(remove);
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.method === "delete")).toHaveLength(1));
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Assignment denied");
  expect(screen.getByText("Người được giao")).toBeTruthy();
});

it("reconciles a label attachment that committed before its response timed out", async () => {
  const label = { id: "saved-label", name: "Đã lưu trước timeout", color: "#ef4444" };
  let attaches = 0;
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "post" && config.url === "/boards/board/labels") return reply(config, { success: true, data: label });
    if (config.method === "patch" && config.url === `/labels/${label.id}`) return reply(config, { success: true, data: label });
    if (config.method === "post" && config.url === `/cards/${testCard.id}/labels`) {
      attaches += 1;
      data.labels = [label];
      throw new AxiosError("Timed out after commit", "ECONNABORTED", config);
    }
    return base(config);
  });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Nhãn của thẻ" }));
  await user.click(screen.getByRole("button", { name: "Tạo nhãn mới" }));
  await user.click(screen.getByRole("button", { name: "Chọn màu #ef4444" }));
  await user.type(screen.getByLabelText("Tên nhãn"), label.name);
  await user.click(screen.getByRole("button", { name: "Tạo" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Đã tạo nhãn"));
  await user.click(screen.getByRole("button", { name: "Tạo" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Tạo" })).toBeNull());
  expect(attaches).toBe(1);
  expect(adapter.mock.calls.filter(([config]) => config.method === "post" && config.url === "/boards/board/labels")).toHaveLength(1);
  expect(data.labels).toEqual([label]);
});

it("locks a checklist item draft while saving and retains it after rejection", async () => {
  data.checklists = [{ id: "check", title: "Danh sách kiểm tra", checklistItems: [] }];
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/checklists/check" && config.method === "post") { await gate.promise; throw httpError(config, 403, "Item denied"); }
    return base(config);
  });
  open(); await screen.findByText("Danh sách kiểm tra"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thêm mục kiểm tra" }));
  const input = screen.getByPlaceholderText("Nhập việc cần làm…");
  await user.type(input, "Giữ mục nháp");
  await user.click(screen.getByRole("button", { name: "Thêm" }));
  await waitFor(() => expect(input).toHaveProperty("disabled", true));
  await user.type(input, " không được ghi đè");
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Item denied");
  expect(input).toHaveProperty("disabled", false);
  expect(input).toHaveProperty("value", "Giữ mục nháp");
});

it("locks a new checklist draft during its request and keeps it when saving fails", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === `/cards/${testCard.id}/checklists`) { await gate.promise; throw httpError(config, 403, "Checklist denied"); }
    return base(config);
  });
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thêm danh sách kiểm tra" }));
  const input = screen.getByLabelText("Tên danh sách kiểm tra");
  await user.type(input, "Checklist nháp");
  await user.click(screen.getByRole("button", { name: "Thêm" }));
  await waitFor(() => expect(input).toHaveProperty("disabled", true));
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Checklist denied");
  expect(input).toHaveProperty("disabled", false);
  expect(input).toHaveProperty("value", "Checklist nháp");
});

it("keeps content, comment and checklist drafts through a locale/theme change and a detail refetch", async () => {
  data.checklists = [{ id: "check", title: "Kiểm tra", checklistItems: [] }];
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  const user = userEvent.setup();
  const title = screen.getByLabelText("Tiêu đề");
  const description = screen.getByLabelText("Mô tả");
  const comment = screen.getByPlaceholderText("Viết bình luận…");
  await user.clear(title); await user.type(title, "Tên đang soạn");
  await user.type(description, "Mô tả đang soạn");
  await user.type(comment, "Bình luận đang soạn");
  await user.click(screen.getByRole("button", { name: "Thêm mục kiểm tra" }));
  const item = screen.getByLabelText("Nội dung mục kiểm tra"); await user.type(item, "Mục đang soạn");
  await user.click(screen.getByRole("button", { name: "Tùy chọn hiển thị" }));
  await user.click(screen.getByRole("menuitemradio", { name: "English" }));
  await user.click(screen.getByRole("button", { name: "Display preferences" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  data.title = "Server title";
  await act(async () => { await client.invalidateQueries({ queryKey: ["kanban", getSessionVersion(), commentResponse.data.user.id, "board", "detail", testCard.id] }); });
  expect(screen.getByLabelText("Title")).toBe(title);
  expect(title).toHaveProperty("value", "Tên đang soạn");
  expect(description).toHaveProperty("value", expect.stringContaining("Mô tả đang soạn"));
  expect(comment).toHaveProperty("value", "Bình luận đang soạn");
  expect(item).toHaveProperty("value", "Mục đang soạn");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

it("filters board labels locally with accessible named checkboxes", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/boards/board/labels" ? reply(config, { success: true, data: [{ id: "urgent", name: "Gấp", color: "#eab308" }, { id: "other", name: "Khác", color: "#ffffff" }] }) : base(config));
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Nhãn của thẻ" }));
  expect(screen.getByRole("checkbox", { name: "Khác" })).toBeTruthy();
  await user.type(screen.getByLabelText("Tìm nhãn"), "gấp");
  expect(screen.getByRole("checkbox", { name: "Gấp" })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Khác" })).toBeNull();
  expect(adapter.mock.calls.filter(([config]) => config.url === "/boards/board/labels")).toHaveLength(1);
});

it("filters available board members by email without another request", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/boards/board/members" ? reply(config, { success: true, data: [
    { boardId: "board", userId: "one", name: "Lan", email: "lan@example.test", avatar: "", roleId: "role", roleName: "BOARD_MEMBER" },
    { boardId: "board", userId: "two", name: "Bình", email: "binh@example.test", avatar: "", roleId: "role", roleName: "BOARD_MEMBER" },
  ] }) : base(config));
  open(); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thêm thành viên vào thẻ" }));
  await screen.findByRole("button", { name: "Lan" });
  await user.type(screen.getByLabelText("Tìm theo tên hoặc email"), "binh@");
  expect(screen.getByRole("button", { name: "Bình" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Lan" })).toBeNull();
  expect(adapter.mock.calls.filter(([config]) => config.url === "/boards/board/members")).toHaveLength(1);
});

it("returns focus to the card opener when its route dialog closes", async () => {
  function BoardHarness() { const navigate = useNavigate(); return <><button id={`board-card-${testCard.id}`} onClick={() => navigate(path)}>Mở thẻ</button><Outlet /></>; }
  render(<MemoryRouter initialEntries={["/boards/board"]}><QueryClientProvider client={client}><Routes><Route path="/boards/:boardId" element={<BoardHarness />}><Route path="cards/:cardId" element={<CardDetail />} /></Route></Routes></QueryClientProvider></MemoryRouter>);
  const user = userEvent.setup(); const opener = screen.getByRole("button", { name: "Mở thẻ" });
  await user.click(opener); await screen.findByRole("heading", { name: testCard.title }); await screen.findByLabelText("Tiêu đề");
  await user.click(screen.getByRole("button", { name: "Đóng" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
});
