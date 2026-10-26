import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AxiosHeaders } from "axios";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import i18n from "@/app/i18n";
import { ThemeProvider } from "next-themes";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { VerifyEmail } from "@/components/VerifyEmail";
import { apiClient } from "@/lib/apiClient";
import { deferred, httpError } from "../../../support/helpers";

const session = vi.hoisted(() => ({ login: vi.fn(), startSession: vi.fn() }));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/apiClient", () => ({ apiClient: { post: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }));
const returnTo = "/boards/test/cards/card?filter=mine#comments";
const query = `?returnTo=${encodeURIComponent(returnTo)}`;

beforeEach(() => {
  void i18n.changeLanguage("en");
  localStorage.clear(); sessionStorage.clear();
  session.login.mockResolvedValue(undefined);
  vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: null });
});
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); });

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search + location.hash}</output>;
}
function renderAuth(path: string) {
  render(<ThemeProvider attribute="class" defaultTheme="light"><QueryClientProvider client={createQueryClient()}><MemoryRouter initialEntries={[path]}><Location /><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/verify" element={<VerifyEmail />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/boards/:boardId/cards/:cardId" element={<h1>Returned to card</h1>} />
    <Route path="/dashboard" element={<h1>Dashboard</h1>} />
  </Routes></MemoryRouter></QueryClientProvider></ThemeProvider>);
}

it("uses native email/required validation and does not submit missing login fields", async () => {
  renderAuth("/login" + query);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(session.login).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Email"), "invalid-email");
  await user.type(screen.getByLabelText("Password"), "test-password{Enter}");
  expect(session.login).not.toHaveBeenCalled();
});

it("submits login with Enter once, disables pending fields and restores the deep link", async () => {
  const gate = deferred<void>();
  session.login.mockReturnValue(gate.promise);
  renderAuth("/login" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password{Enter}");
  const button = screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await user.click(button);
  expect(session.login).toHaveBeenCalledExactlyOnceWith({ email: "member@example.test", password: "test-password" });
  await act(async () => gate.resolve());
  expect(await screen.findByRole("heading", { name: "Returned to card" })).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toBe(returnTo);
});

it("keeps login drafts and displays rejected credentials without navigation", async () => {
  session.login.mockRejectedValue(httpError({ headers: new AxiosHeaders() }, 401, "Invalid password"));
  renderAuth("/login" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password{Enter}");
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Invalid password");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("test-password");
  expect(screen.getByTestId("location").textContent).toContain("/login");
});

it("offers verification for an unverified login while preserving its destination", async () => {
  session.login.mockRejectedValue(httpError({ headers: new AxiosHeaders() }, 403,
    "Your account has not been verified. Please verify your account before logging in."));
  renderAuth("/login" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password{Enter}");
  await user.click(await screen.findByRole("button", { name: "Verify email" }));
  expect(screen.getByRole("heading", { name: "Verify your email" })).toBeTruthy();
  expect(localStorage.getItem("emailForVerification")).toBe("member@example.test");
  expect(screen.getByTestId("location").textContent).toBe("/verify" + query);
});

it("rejects a password mismatch, then registers once through the real form submission", async () => {
  renderAuth("/register" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Thành viên");
  await user.type(screen.getByLabelText("Email"), "member@example.test");
  await user.type(screen.getByLabelText("Password", { exact: true }), "test-password");
  await user.type(screen.getByLabelText("Confirm password"), "different-password{Enter}");
  expect(screen.getByRole("alert")).toHaveProperty("textContent", "Passwords do not match");
  expect(apiClient.post).not.toHaveBeenCalled();
  const confirmation = screen.getByLabelText("Confirm password");
  await user.clear(confirmation);
  const gate = deferred<Awaited<ReturnType<typeof apiClient.post>>>();
  vi.mocked(apiClient.post).mockReturnValue(gate.promise);
  await user.type(confirmation, "test-password{Enter}");
  expect((screen.getByRole("button", { name: "Creating account…" }) as HTMLButtonElement).disabled).toBe(true);
  expect(apiClient.post).toHaveBeenCalledOnce();
  await act(async () => gate.resolve({ success: true, data: null }));
  expect(await screen.findByText("Verify your email")).toBeTruthy();
  expect(localStorage.getItem("emailForVerification")).toBe("member@example.test");
  expect(screen.getByTestId("location").textContent).toBe("/verify" + query);
});

it("verifies the OTP with Enter and carries the destination back to login", async () => {
  localStorage.setItem("emailForVerification", "member@example.test");
  renderAuth("/verify" + query);
  const user = userEvent.setup();
  const input = screen.getByLabelText("Verification code");
  await user.type(input, "12345{Enter}");
  expect(apiClient.post).not.toHaveBeenCalled();
  await user.type(input, "6{Enter}");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(apiClient.post).toHaveBeenCalledExactlyOnceWith("/auth/verify", { email: "member@example.test", otp: "123456" });
  expect(localStorage.getItem("emailForVerification")).toBeNull();
  expect(screen.getByTestId("location").textContent).toBe("/login" + query);
});

it("resends verification OTP, blocks duplicates and re-enables it after the cooldown", async () => {
  vi.useFakeTimers();
  localStorage.setItem("emailForVerification", "member@example.test");
  renderAuth("/verify" + query);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Resend code" })); });
  const blocked = screen.getByRole("button", { name: "Resend in 60s" }) as HTMLButtonElement;
  expect(blocked.disabled).toBe(true);
  fireEvent.click(blocked);
  expect(apiClient.post).toHaveBeenCalledExactlyOnceWith("/auth/send-otp", { email: "member@example.test" });
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect((screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps OTP input and allows retry when verification or resend fails", async () => {
  localStorage.setItem("emailForVerification", "member@example.test");
  vi.mocked(apiClient.post).mockRejectedValue(httpError({ headers: new AxiosHeaders() }, 422, "OTP expired"));
  renderAuth("/verify" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Verification code"), "123456{Enter}");
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "OTP expired");
  expect((screen.getByLabelText("Verification code") as HTMLInputElement).value).toBe("123456");
  await user.click(screen.getByRole("button", { name: "Resend code" }));
  expect((screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled).toBe(false);
});

it("returns a verification route with no email to registration without losing its destination", async () => {
  renderAuth("/verify" + query);
  await screen.findByText("Create an account");
  expect(screen.getByTestId("location").textContent).toBe("/register" + query);
});

it("completes password recovery, preserves the return destination and clears the old session", async () => {
  renderAuth("/forgot-password" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.test{Enter}");
  await screen.findByLabelText("New password");
  await user.type(screen.getByLabelText("OTP"), "123456");
  await user.type(screen.getByLabelText("New password"), "new-password");
  await user.type(screen.getByLabelText("Confirm password"), "different-password");
  expect((screen.getByRole("button", { name: "Reset password" }) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText("Confirm password"));
  await user.type(screen.getByLabelText("Confirm password"), "new-password{Enter}");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(apiClient.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "member@example.test", otp: "123456", newPassword: "new-password" }, { withCredentials: true });
  expect(session.startSession).toHaveBeenCalledOnce();
  expect(localStorage.getItem("forgot-password-email")).toBeNull();
  expect(screen.getByTestId("location").textContent).toBe("/login" + query);
});

it("keeps password recovery fields when saving fails", async () => {
  localStorage.setItem("forgot-password-email", JSON.stringify({ email: "member@example.test", expiresAt: Date.now() + 60_000 }));
  vi.mocked(apiClient.post).mockRejectedValue(httpError({ headers: new AxiosHeaders() }, 422, "OTP expired"));
  renderAuth("/forgot-password" + query);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("OTP"), "123456");
  await user.type(screen.getByLabelText("New password"), "new-password");
  await user.type(screen.getByLabelText("Confirm password"), "new-password{Enter}");
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "OTP expired");
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("new-password");
  expect(session.startSession).not.toHaveBeenCalled();
});

it.each(["invalid", JSON.stringify({ email: 42, expiresAt: Date.now() + 1000 }), JSON.stringify({ email: "member@example.test", expiresAt: 1 })])(
  "discards malformed or expired recovery storage %#", (value) => {
    localStorage.setItem("forgot-password-email", value);
    renderAuth("/forgot-password" + query);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(localStorage.getItem("forgot-password-email")).toBeNull();
  },
);

it("falls back to the dashboard for an external login destination", async () => {
  renderAuth("/login?returnTo=" + encodeURIComponent("//evil.test"));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password{Enter}");
  await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy());
});
it("keeps auth credentials and password visibility through language/theme changes", async () => {
  renderAuth("/login" + query);
  const user = userEvent.setup();
  const email = screen.getByLabelText("Email"); const password = screen.getByLabelText("Password");
  await user.type(email, "member@example.test"); await user.type(password, "draft-password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  await user.click(screen.getByRole("button", { name: "Display preferences" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Tiếng Việt" }));
  expect(screen.getByLabelText("Mật khẩu")).toBe(password);
  expect(password).toHaveProperty("value", "draft-password");
  expect(password).toHaveProperty("type", "text");
  await user.click(screen.getByRole("button", { name: "Tùy chọn hiển thị" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Tối" }));
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect(email).toHaveProperty("value", "member@example.test");
  expect(session.login).not.toHaveBeenCalled();
});
