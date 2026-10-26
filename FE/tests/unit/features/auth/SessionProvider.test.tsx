import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AxiosError, type AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import { apiClient, axiosClient, refreshClient, resetApiSession } from "@/lib/apiClient";
import { SidebarLogout } from "@/components/layout/SidebarLogout";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Notifications } from "@/components/Notifications";
import { deferred, httpError, reply } from "../../../support/helpers";
import { testCard } from "../../../support/fixtures";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { RequireSession } from "@/features/auth/RequireSession";
import { useSession } from "@/features/auth/session-context";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
const alice = { id: "alice", name: "Alice", email: "alice@example.test", avatar: null };
const bob = { id: "bob", name: "Bob", email: "bob@example.test", avatar: null };
const blockedAdapter = axiosClient.defaults.adapter;
const sockets: Array<{ close: ReturnType<typeof vi.fn> }> = [];
let client = createQueryClient();
let currentUser = alice;
let failedLogout = false;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;

beforeEach(() => {
  resetApiSession();
  client = createQueryClient(); currentUser = alice; failedLogout = false;
  sockets.length = 0;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("WebSocket", class {
    static CLOSED = 3;
    readyState = 1;
    close = vi.fn(() => { this.readyState = 3; });
    constructor() { sockets.push(this); }
  });
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    if (config.url === "/users/me") return reply(config, { success: true, data: currentUser });
    if (config.url === "/auth/login") { currentUser = bob; return reply(config, { success: true, data: {} }); }
    if (config.url === "/auth/logout") {
      if (failedLogout) throw new AxiosError("Offline", "ERR_NETWORK", config);
      return reply(config, { success: true, data: null });
    }
    if (config.url === "/notifications") return reply(config, { success: true, data: [], pagination: { totalItems: 0, itemsPerPage: 10, currentPage: 1, totalPages: 0 } });
    if (config.url === "/notifications/unread-count") return reply(config, { success: true, data: { count: 0 } });
    throw new Error(`Unexpected URL ${config.url}`);
  });
  axiosClient.defaults.adapter = adapter;
  refreshClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
});
afterEach(() => {
  client.clear();
  axiosClient.defaults.adapter = blockedAdapter;
  refreshClient.defaults.adapter = blockedAdapter;
  sessionStorage.clear();
});

function PublicScreen() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  return <><p>Login screen {location.search}</p><button onClick={async () => {
    await session.login({ email: bob.email, password: "test-password" });
    navigate("/dashboard");
  }}>Sign in as Bob</button></>;
}
function PrivateScreen() {
  const session = useSession();
  return <><h1>Private {session.user?.name}</h1><SidebarProvider><SidebarLogout /></SidebarProvider><Notifications /></>;
}
function SwitchRoute() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/login")}>Open login</button>;
}
function renderSession(path = "/boards/test/cards/card?filter=mine#comments") {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><SessionProvider>
    <SwitchRoute /><Routes>
      <Route path="/login" element={<PublicScreen />} />
      <Route element={<RequireSession />}>
        <Route path="/dashboard" element={<PrivateScreen />} />
        <Route path="/my-work/*" element={<PrivateScreen />} />
        <Route path="/archived" element={<PrivateScreen />} />
        <Route path="/boards/:boardId/cards/:cardId" element={<PrivateScreen />} />
      </Route>
    </Routes>
  </SessionProvider></QueryClientProvider></MemoryRouter>);
}
async function clickLogout() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
  await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
}

it.each(["/my-work?due=soon", "/my-work/boards/test/cards/card?isComplete=false", "/archived"])("loads the authenticated session on direct work and archive link %s", async (path) => {
  renderSession(path);
  expect(await screen.findByRole("heading", { name: "Private Alice" })).toBeTruthy();
  expect(adapter.mock.calls.some(([config]) => config.url === "/users/me")).toBe(true);
});

it("waits for /me before mounting private content on a deep link", async () => {
  const gate = deferred<void>();
  adapter.mockImplementationOnce(async (config) => { await gate.promise; return reply(config, { success: true, data: alice }); });
  renderSession();
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Private Alice" })).toBeNull();
  gate.resolve();
  expect(await screen.findByRole("heading", { name: "Private Alice" })).toBeTruthy();
});

it("checks the session for case-insensitive routes accepted by React Router", async () => {
  renderSession("/DASHBOARD");
  expect(await screen.findByRole("heading", { name: "Private Alice" })).toBeTruthy();
});

it("redirects an expired session to login and preserves the entire internal deep link", async () => {
  adapter.mockImplementation(async (config) => { throw httpError(config, 401); });
  renderSession();
  expect(await screen.findByText(/Login screen/)).toHaveProperty("textContent", expect.stringContaining(encodeURIComponent("/boards/test/cards/card?filter=mine#comments")));
  expect(client.getQueryData(["kanban", "alice"])).toBeUndefined();
});

it("keeps a network failure on the private gate and recovers with Retry", async () => {
  adapter.mockRejectedValueOnce(new AxiosError("Offline", "ERR_NETWORK"));
  renderSession();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Không thể kết nối"));
  expect(screen.queryByText(/Login screen/)).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("heading", { name: "Private Alice" })).toBeTruthy();
});

it("does not render a private route for a malformed user envelope", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { id: "alice" } }));
  renderSession();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Private Alice" })).toBeNull();
});

it("clears queries and its socket only after logout succeeds", async () => {
  renderSession();
  await screen.findByRole("heading", { name: "Private Alice" });
  client.setQueryData(["private-data"], "alice-only");
  client.setQueryData(["kanban", "alice"], [testCard]);
  client.setQueryData(["catalog", "alice", "projects"], [{ id: "alice-project", name: "Alice project" }]);
  await clickLogout();
  await screen.findByText(/Login screen/);
  expect(client.getQueryData(["private-data"])).toBeUndefined();
  expect(client.getQueryData(["kanban", "alice"])).toBeUndefined();
  expect(client.getQueryData(["catalog", "alice", "projects"])).toBeUndefined();
  expect(sockets[0].close).toHaveBeenCalled();
});

it("keeps the current identity and cached data if logout fails", async () => {
  failedLogout = true;
  renderSession();
  await screen.findByRole("heading", { name: "Private Alice" });
  client.setQueryData(["private-data"], "alice-only");
  client.setQueryData(["kanban", "alice"], [testCard]);
  await clickLogout();
  expect(await screen.findByRole("alert")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.getByRole("heading", { name: "Private Alice" })).toBeTruthy();
  expect(client.getQueryData(["private-data"])).toBe("alice-only");
  expect(client.getQueryData(["kanban", "alice"])).toHaveLength(1);
  expect(sockets[0].close).not.toHaveBeenCalled();
});

it("starts a new account with fresh catalogue and Kanban state", async () => {
  renderSession("/dashboard");
  await screen.findByRole("heading", { name: "Private Alice" });
  client.setQueryData(["kanban", "alice"], [testCard]);
  client.setQueryData(["private-data"], "alice-only");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open login" }));
  await user.click(screen.getByRole("button", { name: "Sign in as Bob" }));
  await screen.findByRole("heading", { name: "Private Bob" });
  expect(screen.queryByRole("heading", { name: "Private Alice" })).toBeNull();
  expect(client.getQueryData(["private-data"])).toBeUndefined();
  expect(client.getQueryData(["kanban", "alice"])).toBeUndefined();
});

it("ignores a late /me response from before a new login", async () => {
  const gate = deferred<void>();
  adapter.mockImplementationOnce(async (config) => { await gate.promise; return reply(config, { success: true, data: alice }); });
  renderSession();
  await waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open login" }));
  await user.click(screen.getByRole("button", { name: "Sign in as Bob" }));
  await screen.findByRole("heading", { name: "Private Bob" });
  await act(async () => { gate.resolve(); await gate.promise; });
  expect(screen.queryByRole("heading", { name: "Private Alice" })).toBeNull();
});

it("does not let an old logout clear a newly authenticated account", async () => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/auth/logout") { await gate.promise; return reply(config, { success: true, data: null }); }
    return base(config);
  });
  renderSession("/dashboard");
  await screen.findByRole("heading", { name: "Private Alice" });
  await clickLogout();
  const user = userEvent.setup();
  fireEvent.click(screen.getByText("Open login"));
  await user.click(screen.getByRole("button", { name: "Sign in as Bob" }));
  await screen.findByRole("heading", { name: "Private Bob" });
  client.setQueryData(["private-data"], "bob-only");
  await act(async () => { gate.resolve(); await gate.promise; });
  expect(screen.getByRole("heading", { name: "Private Bob" })).toBeTruthy();
  expect(client.getQueryData(["private-data"])).toBe("bob-only");
  expect(toastError).not.toHaveBeenCalled();
});

it("resets the old scope if /me detects that the server account changed", async () => {
  renderSession("/dashboard");
  await screen.findByRole("heading", { name: "Private Alice" });
  client.setQueryData(["private-data"], "alice-only");
  client.setQueryData(["kanban", "alice"], [testCard]);
  currentUser = bob;
  await act(async () => { await client.invalidateQueries({ queryKey: ["session"] }); });
  await screen.findByRole("heading", { name: "Private Bob" });
  expect(client.getQueryData(["private-data"])).toBeUndefined();
  expect(client.getQueryData(["kanban", "alice"])).toBeUndefined();
});

it("cancels in-flight private requests after successful logout", async () => {
  renderSession("/dashboard");
  await screen.findByRole("heading", { name: "Private Alice" });
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/projects") { await gate.promise; return reply(config, { success: true, data: "alice-only" }); }
    return base(config);
  });
  const pending = apiClient.get("/projects").catch((error: unknown) => error);
  await waitFor(() => expect(adapter.mock.calls.some(([config]) => config.url === "/projects")).toBe(true));
  await clickLogout();
  await screen.findByText(/Login screen/);
  gate.resolve();
  expect(await pending).toMatchObject({ code: "ERR_CANCELED" });
});
