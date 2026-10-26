import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { type AxiosAdapter } from "axios";
import { CardResources } from "@/features/cards/CardResources";
import { getAttachments, getAttachmentDownload, getCardActivities } from "@/features/cards/api";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { httpError, reply } from "../../../support/helpers";

vi.mock("@/features/auth/session-context", () => ({ useSession: () => ({ user: { id: "reader" } }) }));
const blocked = axiosClient.defaults.adapter;
let client = createQueryClient();
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
beforeEach(() => {
  resetApiSession(); client = createQueryClient(); client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: [] }));
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });

it("does not request files or activity before a section opens", async () => {
  render(<QueryClientProvider client={client}><CardResources boardId="board" cardId="c1" attachmentCount={0} /></QueryClientProvider>);
  expect(adapter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Tệp đính kèm"));
  await screen.findByText("Chọn tệp");
  expect(adapter.mock.calls.some(([config]) => config.url === "/cards/c1/attachments")).toBe(true);
  expect(adapter.mock.calls.some(([config]) => config.url?.includes("activities"))).toBe(false);
});

it("retains the selected file after a rejected upload and sends only the file part", async () => {
  adapter.mockImplementation(async (config) => {
    if (config.method === "post") throw httpError(config, 403, "Không được tải tệp");
    return reply(config, { success: true, data: [] });
  });
  render(<QueryClientProvider client={client}><CardResources boardId="board" cardId="c1" attachmentCount={0} /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Tệp đính kèm"));
  const input = await screen.findByLabelText("Chọn tệp");
  const file = new File(["image bytes"], "ke-hoach.png", { type: "image/png" });
  const user = userEvent.setup(); await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "Tải lên" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Không được tải tệp");
  expect(screen.getByText(file.name)).toBeTruthy();
  const upload = adapter.mock.calls.find(([config]) => config.method === "post")![0];
  expect(upload.data).toBeInstanceOf(FormData);
  expect([...upload.data.keys()]).toEqual(["file"]);
  await waitFor(() => expect(screen.getByRole("button", { name: "Tải lên" })).toHaveProperty("disabled", false));
});

it("rejects an oversized file without sending an upload", async () => {
  render(<QueryClientProvider client={client}><CardResources boardId="board" cardId="c1" attachmentCount={0} /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Tệp đính kèm"));
  const input = await screen.findByLabelText("Chọn tệp");
  await userEvent.setup().upload(input, new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Tải lên" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Chọn ảnh JPG, PNG, WebP hoặc PDF không rỗng, tối đa 10 MiB.");
  expect(adapter.mock.calls.some(([config]) => config.method === "post")).toBe(false);
});

it.each(["javascript:alert(1)", "data:text/html,test", "http://files.test/unsafe", "https://user:pass@files.test/private"])("rejects an unsafe signed download %s", async (url) => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { url, expiresAt: "2050-01-01T00:00:00Z" } }));
  await expect(getAttachmentDownload("c1", "f1")).rejects.toThrow();
});
it("rejects an expired signed download", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { url: "https://files.test/file", expiresAt: "2020-01-01T00:00:00Z" } }));
  await expect(getAttachmentDownload("c1", "f1")).rejects.toThrow();
});
it("accepts a fresh HTTPS download without credentials", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { url: "https://files.test/file?signature=test", expiresAt: "2050-01-01T00:00:00Z" } }));
  await expect(getAttachmentDownload("c1", "f1")).resolves.toBe("https://files.test/file?signature=test");
});
it("rejects files or activity belonging to a different card", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: [{ id: "f1", cardId: "other" }] }));
  await expect(getAttachments("c1", new AbortController().signal)).rejects.toThrow();
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { items: [{ id: "event", cardId: "other" }], nextCursor: null } }));
  await expect(getCardActivities("c1", undefined, new AbortController().signal)).rejects.toThrow();
});
