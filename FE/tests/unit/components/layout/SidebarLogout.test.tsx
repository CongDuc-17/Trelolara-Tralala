import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { deferred } from "../../../support/helpers";
import { SidebarLogout } from "@/components/layout/SidebarLogout";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";

const session = vi.hoisted(() => ({ user: { id: "an", name: "Nguyễn An", email: "an@example.test", avatar: null }, logout: vi.fn(), isLoggingOut: false }));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => session }));
vi.mock("@/components/layout/TaskSchedule", () => ({ TaskSchedule: () => <h2>Lịch kiểm thử</h2> }));
beforeEach(() => { session.logout.mockReset(); session.logout.mockResolvedValue(undefined); });
function mount() {
  render(<MemoryRouter initialEntries={["/dashboard"]}><Routes><Route path="/dashboard" element={<SidebarProvider><SidebarLogout /><WorkspacePanel open onClose={() => {}} /></SidebarProvider>} /><Route path="/login" element={<h1>Login reached</h1>} /></Routes></MemoryRouter>);
}

it("shows a static user identity above the calendar without profile or logout menus", () => {
  mount();
  const panel = screen.getByRole("complementary", { name: "Lịch công việc" });
  expect(within(panel).getByRole("group", { name: "Tài khoản Nguyễn An" })).toBeTruthy();
  expect(within(panel).getByText("an@example.test")).toBeTruthy();
  expect(within(panel).queryByRole("button", { name: /Tài khoản|Đăng xuất/ })).toBeNull();
  expect(within(panel).queryByRole("link", { name: "Hồ sơ cá nhân" })).toBeNull();
});

it("requires confirmation and restores trigger focus when cancelled", async () => {
  mount(); const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Đăng xuất" });
  await user.click(trigger);
  expect(session.logout).not.toHaveBeenCalled();
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Hủy" }));
  expect(session.logout).not.toHaveBeenCalled();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("blocks duplicate submits and dismissal while pending, retains errors and retries", async () => {
  const gate = deferred<void>(); session.logout.mockReturnValueOnce(gate.promise);
  mount(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
  const dialog = screen.getByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Đăng xuất" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(session.logout).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveProperty("disabled", true);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await act(async () => { gate.reject(new Error("Offline")); });
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Đăng xuất" }));
  expect(await screen.findByRole("heading", { name: "Login reached" })).toBeTruthy();
});
