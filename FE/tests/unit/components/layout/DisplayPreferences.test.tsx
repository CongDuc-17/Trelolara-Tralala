import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import i18n, { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY, readLanguage } from "@/app/i18n";
import viMessages from "@/app/locales/vi.json";
import enMessages from "@/app/locales/en.json";
import { Profile } from "@/pages/Profile";
import { CreateProject } from "@/components/projects/CreateProject";
import { DisplayPreferences } from "@/components/layout/DisplayPreferences";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "an", name: "Nguyễn An", email: "an@example.test", bio: "Developer" } }) }));

beforeEach(() => { localStorage.clear(); });

function view(element = <Profile />, sidebar = false) {
  const client = createQueryClient();
  client.setQueryData(["draft-check"], { retained: true });
  const result = render(<ThemeProvider attribute="class" storageKey={THEME_STORAGE_KEY} defaultTheme="system" enableSystem>
    <QueryClientProvider client={client}><TooltipProvider><DisplayPreferences sidebar={sidebar} />{element}</TooltipProvider></QueryClientProvider>
  </ThemeProvider>);
  return { ...result, client };
}

it("switches language and theme through the menu without remounting or losing a profile draft", async () => {
  const { client } = view();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Sửa hồ sơ" }));
  const input = screen.getByLabelText("Họ tên") as HTMLInputElement;
  await user.clear(input);
  await user.type(input, "Bản nháp của An");
  await user.click(screen.getByRole("button", { name: "Tùy chọn hiển thị" }));
  await user.click(screen.getByRole("menuitemradio", { name: "English" }));
  expect(screen.getByLabelText("Name")).toBe(input);
  expect(input.value).toBe("Bản nháp của An");
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  await user.click(screen.getByRole("button", { name: "Display preferences" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect(screen.getByLabelText("Name")).toBe(input);
  expect(input.value).toBe("Bản nháp của An");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(client.getQueryData(["draft-check"])).toEqual({ retained: true });
});

it("switches sidebar preferences directly and preserves the current draft", async () => {
  view(<Profile />, true);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Sửa hồ sơ" }));
  const input = screen.getByLabelText("Họ tên");
  fireEvent.change(input, { target: { value: "Bản nháp" } });
  await user.click(screen.getByRole("radio", { name: "English" }));
  expect(screen.getByLabelText("Name")).toBe(input);
  expect(input).toHaveProperty("value", "Bản nháp");
  expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
  await user.click(screen.getByRole("radio", { name: "Dark" }));
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(input).toHaveProperty("value", "Bản nháp");
  await user.click(screen.getByRole("radio", { name: "System" }));
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
});

it("preserves an open creation dialog and its draft when the locale changes", async () => {
  view(<CreateProject />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Tạo dự án" }));
  const input = screen.getByLabelText("Tên dự án") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Thiết kế sản phẩm" } });
  await act(async () => { await i18n.changeLanguage("en"); });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByLabelText("Project name")).toBe(input);
  expect(input.value).toBe("Thiết kế sản phẩm");
  expect(screen.getByRole("heading", { name: "Create a project" })).toBeTruthy();
});

it("loads a saved theme and follows system changes only when System is selected", async () => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = { matches: false, media: "(prefers-color-scheme: dark)", addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener), removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener) };
  vi.stubGlobal("matchMedia", () => media);
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  const first = view(<div />);
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  first.unmount();
  localStorage.setItem(THEME_STORAGE_KEY, "system");
  const second = view(<div />);
  await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
  act(() => { media.matches = true; listeners.forEach((listener) => listener({ matches: true })); });
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  await userEvent.setup().click(screen.getByRole("button", { name: "Tùy chọn hiển thị" }));
  await userEvent.setup().click(screen.getByRole("menuitemradio", { name: "Sáng" }));
  act(() => { listeners.forEach((listener) => listener({ matches: true })); });
  expect(document.documentElement.classList.contains("light")).toBe(true);
  second.unmount();
  expect(listeners.size).toBe(0);
});

it("defaults to Vietnamese and tolerates unavailable or unsupported browser preferences", () => {
  expect(readLanguage()).toBe("vi");
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  expect(readLanguage()).toBe("en");
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
  expect(readLanguage()).toBe("vi");
  const unavailable = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(readLanguage()).toBe("vi");
  unavailable.mockRestore();
});

it("keeps translation keys and interpolation variables in sync for both languages", () => {
  function flatten(value: object, prefix = ""): Record<string, string> {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item]] : Object.entries(flatten(item, prefix + key + "."))));
  }
  const viEntries = flatten(viMessages);
  const enEntries = flatten(enMessages);
  expect(Object.keys(enEntries).sort()).toEqual(Object.keys(viEntries).sort());
  for (const key of Object.keys(viEntries)) {
    expect(enEntries[key].trim(), key).not.toBe("");
    expect(enEntries[key].match(/\{\{\w+\}\}/g) ?? [], key).toEqual(viEntries[key].match(/\{\{\w+\}\}/g) ?? []);
  }
});
