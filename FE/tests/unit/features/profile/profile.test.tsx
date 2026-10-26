import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { Profile } from "@/pages/Profile";
import { ChangePassword } from "@/components/user/ChangePassword";
import { deferred, reply } from "../../../support/helpers";
import i18n from "@/app/i18n";

const session = vi.hoisted(() => ({
  user: { id: "alice", name: "Alice", email: "alice@example.test", address: "Hà Nội", bio: "Developer", avatar: null },
  getMyInformation: vi.fn(),
}));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => session }));
const originalAdapter = axiosClient.defaults.adapter;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;

beforeEach(() => {
  void i18n.changeLanguage("en");
  resetApiSession();
  session.user = { id: "alice", name: "Alice", email: "alice@example.test", address: "Hà Nội", bio: "Developer", avatar: null };
  session.getMyInformation.mockResolvedValue(undefined);
  adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: session.user }));
  axiosClient.defaults.adapter = adapter;
  vi.stubGlobal("alert", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { axiosClient.defaults.adapter = originalAdapter; });

function view(element = <Profile />) {
  const client = createQueryClient();
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

it("keeps a profile draft through a background identity refresh and cancels to fresh data", async () => {
  const rendered = view();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  const name = screen.getByDisplayValue("Alice");
  await user.clear(name);
  await user.type(name, "Draft name");
  session.user = { ...session.user, name: "Fresh name" };
  rendered.rerender(<QueryClientProvider client={createQueryClient()}><Profile /></QueryClientProvider>);
  expect(screen.getByDisplayValue("Draft name")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect((screen.getByDisplayValue("Fresh name") as HTMLInputElement).disabled).toBe(true);
});

it("submits multipart profile fields and waits for identity refresh before leaving edit mode", async () => {
  const refresh = deferred<void>();
  session.getMyInformation.mockReturnValue(refresh.promise);
  view();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  const name = screen.getByDisplayValue("Alice");
  await user.clear(name);
  await user.type(name, "Saved name");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(session.getMyInformation).toHaveBeenCalledOnce());
  const config = adapter.mock.calls[0][0];
  expect(config).toMatchObject({ method: "put", url: "/users/me", withCredentials: true });
  const data = config.data as FormData;
  expect([...data.entries()]).toEqual([["name", "Saved name"], ["address", "Hà Nội"], ["bio", "Developer"]]);
  expect((screen.getByRole("button", { name: /Saving profile/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByDisplayValue("Saved name") as HTMLInputElement).disabled).toBe(true);
  session.user = { ...session.user, name: "Saved name" };
  await act(async () => refresh.resolve());
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull());
  expect((screen.getByDisplayValue("Saved name") as HTMLInputElement).disabled).toBe(true);
});

it("retains failed profile drafts without refetching identity", async () => {
  adapter.mockRejectedValueOnce(new AxiosError("Offline", "ERR_NETWORK"));
  view();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  await user.type(screen.getByDisplayValue("Developer"), " draft");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByDisplayValue("Developer draft")).toBeTruthy();
  expect(session.getMyInformation).not.toHaveBeenCalled();
});

it("releases avatar previews on replacement, cancel and unmount", async () => {
  const create = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second").mockReturnValueOnce("blob:third");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const rendered = view();
  const input = rendered.container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["first"], "first.png", { type: "image/png" })] } });
  fireEvent.change(input, { target: { files: [new File(["second"], "second.png", { type: "image/png" })] } });
  expect(revoke).toHaveBeenCalledWith("blob:first");
  await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
  expect(revoke).toHaveBeenCalledWith("blob:second");
  fireEvent.change(input, { target: { files: [new File(["third"], "third.png", { type: "image/png" })] } });
  rendered.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:third");
});

it("preserves a failed password draft and sends only the backend password field when retried", async () => {
  adapter.mockRejectedValueOnce(new AxiosError("Offline", "ERR_NETWORK"));
  view(<ChangePassword />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await user.type(screen.getByLabelText("New password"), "new-password");
  await user.type(screen.getByLabelText("Confirm password"), "new-password");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(window.alert).not.toHaveBeenCalled();
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("new-password");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(adapter.mock.calls[1][0]).toMatchObject({ method: "patch", url: "/users/me/change-password", data: JSON.stringify({ newPassword: "new-password" }) });
});
it("rejects non-image and oversized avatars without replacing a draft or sending a request", async () => {
  const create = vi.fn(); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  const rendered = view();
  const input = rendered.container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["text"], "note.txt", { type: "text/plain" })] } });
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Choose an image no larger than 5 MB.");
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })] } });
  expect(create).not.toHaveBeenCalled(); expect(adapter).not.toHaveBeenCalled();
});

it("keeps the password dialog open while saving and clears secrets when cancelled", async () => {
  const gate = deferred<void>(); const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { await gate.promise; return base(config); });
  view(<ChangePassword />); const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Change password" }); await user.click(trigger);
  await user.type(screen.getByLabelText("New password"), "new-password");
  await user.type(screen.getByLabelText("Confirm password"), "new-password");
  const save = screen.getByRole("button", { name: "Save changes" });
  fireEvent.click(save); fireEvent.click(save);
  await waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  expect(await screen.findByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
  await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => gate.resolve());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Password updated.");
  await user.click(trigger); await user.type(screen.getByLabelText("New password"), "unsaved-secret");
  await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(trigger);
  expect(screen.getByLabelText("New password")).toHaveProperty("value", "");
});

it("submits profile by Enter only once, shows failures inline and omits unsupported settings", async () => {
  const gate = deferred<void>(); adapter.mockImplementation(async () => { await gate.promise; throw new AxiosError("Offline", "ERR_NETWORK"); });
  view(); const user = userEvent.setup();
  expect(screen.queryByRole("button", { name: /Delete Account/ })).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  await user.type(screen.getByDisplayValue("Alice"), " draft{Enter}");
  await waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  await act(async () => gate.resolve());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not connect to the server. Please try again.");
  expect(screen.getByDisplayValue("Alice draft")).toBeTruthy();
});
it("blocks unsupported clearing of saved profile fields instead of reporting a partial save", async () => {
  view(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  expect(screen.getByRole("button", { name: "Save profile" })).toHaveProperty("disabled", true);
  await user.clear(screen.getByDisplayValue("Developer"));
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter new text to change a saved address or bio.");
  expect(adapter).not.toHaveBeenCalled();
});

it("keeps profile editing in the personal tab and preserves the draft between tabs", async () => {
  view(); const user = userEvent.setup();
  expect(screen.getByDisplayValue("alice@example.test")).toHaveProperty("readOnly", true);
  await user.click(screen.getByRole("tab", { name: "Security" }));
  expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Personal" }));
  await user.click(screen.getByRole("button", { name: "Edit profile" }));
  await user.type(screen.getByDisplayValue("Alice"), " draft");
  await user.click(screen.getByRole("tab", { name: "Security" }));
  await user.click(screen.getByRole("tab", { name: "Personal" }));
  expect(screen.getByDisplayValue("Alice draft")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit profile" })));
  expect(screen.getByDisplayValue("Alice")).toHaveProperty("disabled", true);
  expect(adapter).not.toHaveBeenCalled();
});
