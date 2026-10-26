import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile.value }));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "an", name: "Nguyễn An", email: "an@example.test" }, logout: vi.fn() }) }));
vi.mock("@/components/Notifications", () => ({ Notifications: () => <button>Thông báo</button> }));
vi.mock("@/components/layout/WorkspacePanel", () => ({ WorkspacePanel: ({ open, onClose }: { open: boolean; onClose: () => void }) => <aside id="dashboard-context" hidden={!open} aria-label="Lịch công việc"><button id="dashboard-context-close" onClick={onClose}>Đóng panel kiểm thử</button></aside> }));

beforeEach(() => {
  mobile.value = false;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

function mount(path = "/dashboard") {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}>
    <Route path="/dashboard" element={<h1>Tổng quan kiểm thử</h1>} />
    <Route path="/projects" element={<h1>Danh mục dự án</h1>} />
    <Route path="/projects/p1" element={<h1>Dự án đã mở</h1>} />
    <Route path="/boards/:boardId/*" element={<h1>Bảng kiểm thử</h1>} />
    <Route path="/my-work/*" element={<h1>Công việc kiểm thử</h1>} />
    <Route path="/me" element={<h1>Hồ sơ kiểm thử</h1>} />
    <Route path="/archived" element={<h1>Mục đã lưu trữ</h1>} />
  </Route></Routes></MemoryRouter>);
}

it.each([
  ["/dashboard", false], ["/projects", false], ["/projects/p1", false], ["/me", false], ["/archived", false],
  ["/my-work/boards/b1/cards/c1", false], ["/boards/b1", true], ["/boards/b1/cards/c1", true], ["/boards/b1/search", false],
])("shares the floating shell and puts %s in its center panel", (path, canvas) => {
  mount(path as string);
  const main = document.getElementById("dashboard-main")!;
  expect(main.getAttribute("data-board-canvas") === "true").toBe(canvas);
  expect(screen.getByRole("main").contains(main)).toBe(true);
  expect(screen.getByRole("button", { name: "Mở lịch công việc" })).toBeTruthy();
  expect(document.querySelector('[data-slot="sidebar"][data-variant="floating"]')).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Thông báo" })).toHaveLength(1);
});

it("keeps only icon destinations in a fixed rail and navigates by keyboard", async () => {
  mount();
  const user = userEvent.setup();
  const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: "Mở rộng điều hướng" })).toBeNull();
  const projects = within(nav).getByRole("link", { name: "Dự án" });
  expect(projects.querySelector("span")?.classList.contains("sr-only")).toBe(true);
  projects.focus();
  await user.keyboard("{Enter}");
  expect(projects.getAttribute("aria-current")).toBe("page");
  expect(await screen.findByRole("heading", { name: "Danh mục dự án" })).toBeTruthy();
  await user.keyboard("{Control>}b{/Control}");
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("collapsed");
});

it("keeps preferences and confirmed logout in the sidebar, with no header account menu", async () => {
  mount();
  const header = screen.getByRole("banner");
  expect(within(header).queryByRole("button", { name: "Tùy chọn hiển thị" })).toBeNull();
  expect(within(header).queryByRole("button", { name: /Tài khoản/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Đăng xuất" }).closest('[data-slot="sidebar-footer"]')).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Ngôn ngữ" })).getByRole("radio", { name: "English" })).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Giao diện" })).getByRole("radio", { name: "Tối" })).toBeTruthy();
});

it("navigates archives into the center while retaining the schedule panel", async () => {
  mount("/boards/b1");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mở lịch công việc" }));
  const panel = screen.getByRole("complementary", { name: "Lịch công việc" });
  const archive = screen.getByRole("link", { name: "Mục đã lưu trữ" });
  await user.click(archive);
  expect(archive.getAttribute("aria-current")).toBe("page");
  expect(within(document.getElementById("dashboard-main")!).getByRole("heading", { name: "Mục đã lưu trữ" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "Lịch công việc" })).toBe(panel);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens, closes and reopens the schedule without remounting and returns keyboard focus", async () => {
  mount();
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Mở lịch công việc" });
  await user.click(toggle);
  const panel = screen.getByRole("complementary", { name: "Lịch công việc" });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await user.click(within(panel).getByRole("button", { name: "Đóng panel kiểm thử" }));
  expect(panel.hasAttribute("hidden")).toBe(true);
  await waitFor(() => expect(document.activeElement).toBe(toggle));
  await user.click(toggle);
  expect(screen.getByRole("complementary", { name: "Lịch công việc" })).toBe(panel);
});

it("opens compact mobile navigation and closes it after choosing a destination", async () => {
  mobile.value = true;
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mở điều hướng" }));
  await user.click(await screen.findByRole("button", { name: "Đóng điều hướng" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Mở điều hướng" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("link", { name: "Dự án" }));
  expect(await screen.findByRole("heading", { name: "Danh mục dự án" })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
