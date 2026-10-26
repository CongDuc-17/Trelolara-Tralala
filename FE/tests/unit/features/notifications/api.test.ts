import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AxiosAdapter } from "axios";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { deferred, reply } from "../../../support/helpers";
import { getNotifications, getUnreadCount, markNotificationRead } from "@/features/notifications/api";
import { readNotificationEvent, type Notification } from "@/features/notifications/types";

const notification: Notification = {
  id: "notification-1", type: "CARD_ASSIGNED", title: "Thẻ được giao", content: "Bạn được giao thẻ A",
  entityType: "CARD", entityId: "card-1", metadata: { boardId: "board-1", token: "private-invitation" },
  isRead: false, createdAt: "2026-10-23T10:00:00.000Z",
};
const blockedAdapter = axiosClient.defaults.adapter;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;

beforeEach(() => {
  resetApiSession();
  adapter = vi.fn<AxiosAdapter>();
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { axiosClient.defaults.adapter = blockedAdapter; });

it("reads a typed page and preserves metadata with its server pagination", async () => {
  adapter.mockImplementation(async (config) => reply(config, {
    success: true, data: [notification], pagination: { currentPage: 2, totalPages: 3, totalItems: 21, itemsPerPage: 10 },
  }));
  const signal = new AbortController().signal;
  expect(await getNotifications(2, signal)).toEqual({ items: [notification], nextPage: 3 });
  expect(adapter).toHaveBeenCalledWith(expect.objectContaining({ url: "/notifications", params: { page: 2, limit: 10 } }));
});

it("sends false explicitly and rejects records outside the requested read filter", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: [notification] }));
  await getNotifications(1, undefined, false);
  expect(adapter.mock.calls[0][0].params).toEqual({ page: 1, limit: 10, isRead: false });
  await expect(getNotifications(1, undefined, true)).rejects.toThrow("Dữ liệu thông báo không hợp lệ.");
});

it("keeps the existing length fallback when pagination is absent", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: Array.from({ length: 10 }, () => notification) }));
  expect((await getNotifications(1)).nextPage).toBe(2);
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: [] }));
  expect((await getNotifications(2)).nextPage).toBeUndefined();
});

it.each([
  null, {}, [{ ...notification, id: "" }], [{ ...notification, content: 1 }],
  [{ ...notification, isRead: "false" }], [{ ...notification, createdAt: "invalid-date" }],
  [{ ...notification, readAt: "invalid-date" }], [{ ...notification, title: undefined }],
])("rejects malformed notification data: %j", async (data) => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data }));
  await expect(getNotifications(1)).rejects.toThrow("Dữ liệu thông báo không hợp lệ.");
});

it.each([
  null, "pagination", {}, { currentPage: 2, totalPages: 2, totalItems: 11, itemsPerPage: 10 },
  { currentPage: 1, totalPages: -1, totalItems: 0, itemsPerPage: 10 },
  { currentPage: 1, totalPages: 1.5, totalItems: 1, itemsPerPage: 10 },
  { currentPage: 1, totalPages: 1, totalItems: -1, itemsPerPage: 10 },
  { currentPage: 1, totalPages: 1, totalItems: 1, itemsPerPage: 0 },
])("rejects malformed or mismatched pagination: %j", async (pagination) => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: [], pagination }));
  await expect(getNotifications(1)).rejects.toThrow("Dữ liệu phân trang thông báo không hợp lệ.");
});

it.each([-1, 1.5, "1", null, Infinity])("rejects an invalid unread count: %j", async (count) => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { count } }));
  await expect(getUnreadCount()).rejects.toThrow("Số thông báo chưa đọc không hợp lệ.");
});

it("checks acknowledgement before accepting a read mutation", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: null }));
  await expect(markNotificationRead("id/1")).resolves.toBeUndefined();
  expect(adapter).toHaveBeenCalledWith(expect.objectContaining({ method: "patch", url: "/notifications/id%2F1/read" }));
  adapter.mockImplementation(async (config) => reply(config, { success: false, data: null }));
  await expect(markNotificationRead("id/1")).rejects.toThrow("Phản hồi đánh dấu đã đọc không hợp lệ.");
});

it("passes cancellation through without treating it as an empty successful list", async () => {
  const gate = deferred<void>();
  adapter.mockImplementation(async (config) => {
    await gate.promise;
    return reply(config, { success: true, data: [] });
  });
  const controller = new AbortController();
  const pending = getNotifications(1, controller.signal).catch((error: unknown) => error);
  await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  controller.abort();
  gate.resolve();
  expect(await pending).toMatchObject({ code: "ERR_CANCELED" });
});

it("accepts only validated notification socket messages", () => {
  const message = { event: "notification:new", data: notification };
  expect(readNotificationEvent(JSON.stringify(message))).toEqual(message);
  expect(readNotificationEvent('{"event":"notification:unread-count","data":{"count":0}}')).toEqual({ event: "notification:unread-count", data: { count: 0 } });
  for (const value of [null, {}, "{broken", "null", '{"event":"board:changed","data":{}}',
    '{"event":"notification:unread-count","data":{"count":-1}}',
    '{"event":"notification:new","data":{"id":"bad"}}']) {
    expect(readNotificationEvent(value)).toBeNull();
  }
});
