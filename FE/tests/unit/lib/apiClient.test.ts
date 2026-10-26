import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, isCancel, type AxiosAdapter } from "axios";
import { apiClient, axiosClient, onSessionExpired, refreshApiSession, refreshClient, resetApiSession } from "@/lib/apiClient";
import { commentResponse } from "../../support/fixtures";
import { deferred, httpError, reply } from "../../support/helpers";

const blockedAdapter = axiosClient.defaults.adapter;
const subscriptions: Array<() => void> = [];
const refreshAdapter = vi.fn<AxiosAdapter>();

beforeEach(() => {
  resetApiSession();
  vi.stubGlobal("cookieStore", undefined);
  refreshClient.defaults.adapter = refreshAdapter;
  refreshAdapter.mockImplementation(async (config) => reply(config, { success: true, data: {} }, 201));
});
afterEach(() => {
  resetApiSession();
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  axiosClient.defaults.adapter = blockedAdapter;
  refreshClient.defaults.adapter = blockedAdapter;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function monitorExpiration() {
  const expired = vi.fn();
  subscriptions.push(onSessionExpired(expired));
  return expired;
}

it("shares socket-triggered cookie refresh and expires a denied session only once", async () => {
  const gate = deferred<void>(); const expired = monitorExpiration();
  refreshAdapter.mockImplementation(async (config) => { await gate.promise; throw httpError(config, 401); });
  const one = refreshApiSession().catch((error) => error); const two = refreshApiSession().catch((error) => error);
  await vi.waitFor(() => expect(refreshAdapter).toHaveBeenCalledOnce());
  gate.resolve(); await Promise.all([one, two]);
  expect(expired).toHaveBeenCalledOnce();
});

it("returns the typed envelope once, sends cookies and never reads a JavaScript token", async () => {
  const adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, commentResponse));
  axiosClient.defaults.adapter = adapter;
  const result = await apiClient.post<typeof commentResponse.data>("/cards/test/comments", { content: "Draft" });
  expect(result.data.cardId).toBe(commentResponse.data.cardId);
  const config = adapter.mock.calls[0][0];
  expect(config.data).toBe(JSON.stringify({ content: "Draft" }));
  expect(config.withCredentials).toBe(true);
  expect(config.headers.has("Authorization")).toBe(false);
  expect(refreshAdapter).not.toHaveBeenCalled();
});

it("preserves a rejected non-HTTP request for its caller", async () => {
  const failure = new Error("Request failed");
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>().mockRejectedValue(failure);
  await expect(apiClient.get("/projects")).rejects.toBe(failure);
});

it("shares one refresh across concurrent 401s and replays each request once", async () => {
  const gate = deferred<void>();
  const attempts = new Map<string, number>();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => {
    const count = (attempts.get(config.url!) ?? 0) + 1;
    attempts.set(config.url!, count);
    if (count === 1) throw httpError(config, 401);
    return reply(config, { success: true, data: config.url });
  });
  refreshAdapter.mockImplementation(async (config) => {
    expect(config.withCredentials).toBe(true);
    expect(config.timeout).toBe(10_000);
    await gate.promise;
    return reply(config, { success: true, data: {} }, 201);
  });
  const requests = Promise.all([apiClient.get("/projects"), apiClient.get("/boards"), apiClient.post("/auth/logout")]);
  await vi.waitFor(() => expect(refreshAdapter).toHaveBeenCalledOnce());
  gate.resolve();
  expect(await requests).toHaveLength(3);
  expect([...attempts.values()]).toEqual([2, 2, 2]);
});

it("reuses a successful refresh for a late 401 from an earlier request", async () => {
  const late = deferred<void>();
  const attempts = new Map<string, number>();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => {
    const count = (attempts.get(config.url!) ?? 0) + 1;
    attempts.set(config.url!, count);
    if (count === 1) {
      if (config.url === "/boards") await late.promise;
      throw httpError(config, 401);
    }
    return reply(config, { success: true, data: [] });
  });
  const first = apiClient.get("/projects");
  const second = apiClient.get("/boards");
  await first;
  late.resolve();
  await second;
  expect(refreshAdapter).toHaveBeenCalledOnce();
});

it("expires the session when a replay is still unauthorized without a refresh loop", async () => {
  const expired = monitorExpiration();
  const adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
  axiosClient.defaults.adapter = adapter;
  await expect(apiClient.get("/users/me")).rejects.toMatchObject({ response: { status: 401 } });
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(refreshAdapter).toHaveBeenCalledOnce();
  expect(expired).toHaveBeenCalledOnce();
});

it.each([401, 403])("expires on refresh rejection %s without replaying the original", async (status) => {
  const expired = monitorExpiration();
  const adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
  axiosClient.defaults.adapter = adapter;
  refreshAdapter.mockImplementation(async (config) => { throw httpError(config, status); });
  await expect(apiClient.get("/users/me")).rejects.toMatchObject({ response: { status } });
  expect(adapter).toHaveBeenCalledOnce();
  expect(expired).toHaveBeenCalledOnce();
});

it("keeps a network failure during refresh distinct from an expired session", async () => {
  const expired = monitorExpiration();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
  const failure = new AxiosError("Offline", "ERR_NETWORK");
  refreshAdapter.mockRejectedValue(failure);
  await expect(apiClient.get("/users/me")).rejects.toBe(failure);
  expect(expired).not.toHaveBeenCalled();
});

it("bounds a stalled refresh and lets the user retry instead of signing them out", async () => {
  vi.useFakeTimers();
  const expired = monitorExpiration();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
  refreshAdapter.mockImplementation(() => new Promise(() => {}));
  const result = expect(apiClient.get("/users/me")).rejects.toMatchObject({ code: "ECONNABORTED" });
  await vi.advanceTimersByTimeAsync(10_001);
  await result;
  expect(expired).not.toHaveBeenCalled();
});

it("cancels one waiter promptly without aborting the refresh needed by another", async () => {
  const gate = deferred<void>();
  const attempts = new Map<string, number>();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => {
    const count = (attempts.get(config.url!) ?? 0) + 1;
    attempts.set(config.url!, count);
    if (count === 1) throw httpError(config, 401);
    return reply(config, { success: true, data: [] });
  });
  refreshAdapter.mockImplementation(async (config) => { await gate.promise; return reply(config, { success: true, data: {} }); });
  const controller = new AbortController();
  const canceled = apiClient.get("/projects", { signal: controller.signal }).catch((error: unknown) => error);
  const remaining = apiClient.get("/boards");
  await vi.waitFor(() => expect(refreshAdapter).toHaveBeenCalledOnce());
  controller.abort();
  expect(isCancel(await canceled)).toBe(true);
  gate.resolve();
  await remaining;
  expect(refreshAdapter).toHaveBeenCalledOnce();
});

it("discards late responses when the session changes", async () => {
  const gate = deferred<void>();
  const adapter = vi.fn<AxiosAdapter>(async (config) => { await gate.promise; return reply(config, { success: true, data: "old account" }); });
  axiosClient.defaults.adapter = adapter;
  const result = apiClient.get("/projects").catch((error: unknown) => error);
  await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
  resetApiSession();
  gate.resolve();
  expect(isCancel(await result)).toBe(true);
});

it("does not dispatch a request queued before a synchronous session change", async () => {
  const adapter = vi.fn<AxiosAdapter>();
  axiosClient.defaults.adapter = adapter;
  const result = apiClient.get("/projects").catch((error: unknown) => error);
  resetApiSession();
  expect(isCancel(await result)).toBe(true);
  expect(adapter).not.toHaveBeenCalled();
});

it("keeps FormData intact instead of forcing a JSON content type", async () => {
  const adapter = vi.fn<AxiosAdapter>(async (config) => reply(config, { success: true, data: null }));
  axiosClient.defaults.adapter = adapter;
  const data = new FormData(); data.append("avatar", new File(["test"], "avatar.png"));
  await apiClient.put("/users/me", data);
  expect(adapter.mock.calls[0][0].data).toBe(data);
  expect(adapter.mock.calls[0][0].headers.getContentType()).not.toBe("application/json");
});

it.each(["/auth/login", "/auth/register", "/auth/verify", "/auth/send-otp", "/auth/forgot-password", "/auth/refresh-token"])(
  "does not refresh or expire the session for a rejected public endpoint %s", async (url) => {
    const expired = monitorExpiration();
    axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 401); });
    await expect(apiClient.post(url)).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshAdapter).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  },
);

it("does not confuse a resource permission failure with a missing session", async () => {
  const expired = monitorExpiration();
  axiosClient.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => { throw httpError(config, 403); });
  await expect(apiClient.get("/boards/private")).rejects.toMatchObject({ response: { status: 403 } });
  expect(refreshAdapter).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});

it("rejects missing configuration before it can send a request", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "");
  const adapter = vi.fn<AxiosAdapter>();
  axiosClient.defaults.adapter = adapter;
  await expect(apiClient.get("/users/me")).rejects.toThrow("VITE_API_BASE_URL");
  expect(adapter).not.toHaveBeenCalled();
});
