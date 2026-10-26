import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { type AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, refreshClient, resetApiSession } from "@/lib/apiClient";
import { deferred, httpError, reply } from "../../support/helpers";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { RequireSession } from "@/features/auth/RequireSession";
import { useSession } from "@/features/auth/session-context";
import { safeReturnTo } from "@/features/auth/redirect";
import { InvitationPage } from "@/pages/InvitationPage";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));
const blocked = axiosClient.defaults.adapter;
const alice = { id: "alice", name: "Alice", email: "alice@example.test" };
let client = createQueryClient();
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
let authenticated: boolean;

beforeEach(() => {
  resetApiSession();
  localStorage.clear();
  sessionStorage.clear();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  authenticated = true;
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    if (config.url === "/users/me") {
      if (!authenticated) throw httpError(config, 401);
      return reply(config, { success: true, data: alice });
    }
    if (config.url === "/auth/login") authenticated = true;
    if (config.url === "/auth/logout") authenticated = false;
    return reply(config, { success: true, data: "Invitation accepted successfully" });
  });
  axiosClient.defaults.adapter = adapter;
  refreshClient.defaults.adapter = async (config) => { throw httpError(config, 401); };
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; refreshClient.defaults.adapter = blocked; localStorage.clear(); sessionStorage.clear(); });

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search + location.hash}</output>;
}
function Login() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  return <button onClick={async () => {
    await session.login({ email: alice.email, password: "fixture-password" });
    navigate(safeReturnTo(new URLSearchParams(location.search).get("returnTo")));
  }}>Đăng nhập kiểm thử</button>;
}
function mount(path = "/invite/projects/test-token?source=email#accept") {
  render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><SessionProvider><Location />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify" element={<h1>Xác minh</h1>} />
      <Route element={<RequireSession />}>
        <Route path="/invite/:scope/:token" element={<InvitationPage />} />
        <Route path="/dashboard" element={<h1>Tổng quan mới</h1>} />
      </Route>
    </Routes>
  </SessionProvider></QueryClientProvider></MemoryRouter>);
}

it.each([
  ["projects", "Chấp nhận", "accept"], ["boards", "Chấp nhận", "accept"],
  ["projects", "Từ chối", "reject"], ["boards", "Từ chối", "reject"],
])("handles %s %s via POST only, then returns to a fresh dashboard", async (scope, label, action) => {
  mount(`/invite/${scope}/test-token`);
  await userEvent.setup().click(await screen.findByRole("button", { name: label }));
  expect(await screen.findByRole("heading", { name: "Tổng quan mới" })).toBeTruthy();
  const invitationRequests = adapter.mock.calls.map(([config]) => config).filter((config) => config.url?.startsWith("/invitations/"));
  expect(invitationRequests).toHaveLength(1);
  expect(invitationRequests[0]).toMatchObject({ method: "post", url: `/invitations/test-token/${action}` });
  expect(screen.getByTestId("location").textContent).toBe("/dashboard");
});

it("preserves a signed invitation through missing authentication and requires an explicit decision after login", async () => {
  authenticated = false;
  const path = "/invite/boards/signed-token?source=email#accept";
  mount(path);
  await screen.findByRole("button", { name: "Đăng nhập kiểm thử" });
  expect(screen.getByTestId("location").textContent).toBe(`/login?returnTo=${encodeURIComponent(path)}`);
  await userEvent.setup().click(screen.getByRole("button", { name: "Đăng nhập kiểm thử" }));
  await screen.findByRole("button", { name: "Chấp nhận" });
  expect(screen.getByTestId("location").textContent).toBe(path);
  expect(adapter.mock.calls.some(([config]) => config.url?.startsWith("/invitations/"))).toBe(false);
});

it("submits only one decision while a response is pending", async () => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url?.startsWith("/invitations/")) await gate.promise;
    return base(config);
  });
  mount();
  const accept = await screen.findByRole("button", { name: "Chấp nhận" });
  fireEvent.click(accept); fireEvent.click(accept);
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.url?.startsWith("/invitations/"))).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Từ chối" })).toHaveProperty("disabled", true);
  await act(async () => gate.resolve());
  await screen.findByRole("heading", { name: "Tổng quan mới" });
});

it.each([
  [409, "Invitation token has expired", "Lời mời đã hết hạn"],
  [404, "Invitation not found", "Không tìm thấy lời mời"],
  [409, "Invitation already processed", "Lời mời đã được xử lý"],
  [409, "User is already a member", "Bạn đã là thành viên"],
  [403, "Forbidden", "Tài khoản này không thể xử lý lời mời"],
])("explains invitation failure %s %s without losing its token", async (status, message, expected) => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url?.startsWith("/invitations/")) throw httpError(config, Number(status), String(message));
    return base(config);
  });
  mount();
  await userEvent.setup().click(await screen.findByRole("button", { name: "Chấp nhận" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining(expected));
  expect(screen.getByTestId("location").textContent).toContain("/invite/projects/test-token");
});

it("preserves the invitation return path when email verification is required", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url?.startsWith("/invitations/")) throw httpError(config, 403, "Verify your email before accepting an invitation");
    return base(config);
  });
  const path = "/invite/projects/test-token?source=email#accept";
  mount(path);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));
  await user.click(await screen.findByRole("button", { name: "Xác minh email" }));
  expect(await screen.findByRole("heading", { name: "Xác minh" })).toBeTruthy();
  expect(localStorage.getItem("emailForVerification")).toBe(alice.email);
  expect(screen.getByTestId("location").textContent).toBe(`/verify?returnTo=${encodeURIComponent(path)}`);
});

it("keeps the return path when switching accounts", async () => {
  const path = "/invite/boards/test-token?source=email#accept";
  mount(path);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Đổi tài khoản" }));
  await screen.findByRole("button", { name: "Đăng nhập kiểm thử" });
  expect(screen.getByTestId("location").textContent).toBe(`/login?returnTo=${encodeURIComponent(path)}`);
});

it.each(["/invite/wrong/test-token", `/invite/projects/${"t".repeat(513)}`])("rejects a malformed invitation route locally: %s", async (path) => {
  mount(path);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Liên kết lời mời không hợp lệ.");
  expect(adapter.mock.calls.some(([config]) => config.url?.startsWith("/invitations/"))).toBe(false);
});
