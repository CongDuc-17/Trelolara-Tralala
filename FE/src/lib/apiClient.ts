import axios, { AxiosError, CanceledError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { getApiBaseUrl } from "./env";

export type Pagination = {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  totalPages: number;
};
export type ApiEnvelope<T> = { success: true; data: T; pagination?: Pagination };
type RequestConfig = Omit<AxiosRequestConfig, "signal"> & { signal?: AbortSignal };
type SessionRequest = InternalAxiosRequestConfig & { _session?: number; _retried?: boolean; _refreshVersion?: number };

const options = { timeout: 10_000, withCredentials: true };
export const axiosClient = axios.create(options);
export const refreshClient = axios.create(options);
let sessionVersion = 0;
let sessionController = new AbortController();
// shortcut: refresh sharing is per tab; verify cross-tab token rotation before release in G03.
let refreshPromise: Promise<void> | null = null;
let refreshVersion = 0;
const expiredListeners = new Set<() => void>();

export function getSessionVersion() { return sessionVersion; }

export function resetApiSession() {
  sessionVersion += 1;
  sessionController.abort();
  sessionController = new AbortController();
  refreshPromise = null;
  refreshVersion = 0;
}

export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => { expiredListeners.delete(listener); };
}

function expireSession(version: number) {
  if (version !== sessionVersion) return;
  resetApiSession();
  expiredListeners.forEach((listener) => listener());
}

function assertCurrent(config: SessionRequest) {
  if (config._session !== sessionVersion || config.signal?.aborted) {
    throw new CanceledError("Request belongs to an ended session");
  }
}

function waitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason instanceof AxiosError ? signal.reason : new CanceledError());
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const version = sessionVersion;
  const timeoutController = new AbortController();
  const signal = AbortSignal.any([sessionController.signal, timeoutController.signal]);
  const timer = setTimeout(() => timeoutController.abort(
    new AxiosError("Session refresh timed out", "ECONNABORTED"),
  ), options.timeout);
  const pending = waitWithSignal(refreshClient.post(
    `${getApiBaseUrl()}/auth/refresh-token`, {}, { signal },
  ), signal).then(() => {
    if (version !== sessionVersion) throw new CanceledError();
    refreshVersion += 1;
  }).finally(() => {
    clearTimeout(timer);
    if (refreshPromise === pending) refreshPromise = null;
  });
  refreshPromise = pending;
  return pending;
}

const publicEndpoints = new Set([
  "/auth/login", "/auth/register", "/auth/verify", "/auth/send-otp",
  "/auth/forgot-password", "/auth/refresh-token",
]);

axiosClient.interceptors.request.use((config: SessionRequest) => {
  config.baseURL = getApiBaseUrl();
  config._session ??= sessionVersion;
  config._refreshVersion ??= refreshVersion;
  if (config.signal) {
    // All FE callers, including Query, supply native AbortSignal; Axios types it more broadly.
    config.signal = AbortSignal.any([sessionController.signal, config.signal as AbortSignal]);
  } else config.signal = sessionController.signal;
  assertCurrent(config);
  if (config.data instanceof FormData) config.headers.delete("Content-Type");
  return config;
});

axiosClient.interceptors.response.use(
  (response) => { assertCurrent(response.config); return response; },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) throw error;
    const config = error.config as SessionRequest;
    assertCurrent(config);
    if (error.response?.status !== 401 || publicEndpoints.has(config.url?.split("?")[0] ?? "")) throw error;
    const version = config._session!;
    if (config._retried) { expireSession(version); throw error; }
    config._retried = true;
    try {
      if ((config._refreshVersion ?? 0) === refreshVersion) {
        await waitWithSignal(refreshSession(), config.signal as AbortSignal);
      }
    } catch (refreshError) {
      if (axios.isAxiosError(refreshError) && [401, 403].includes(refreshError.response?.status ?? 0)) {
        expireSession(version);
      }
      throw refreshError;
    }
    assertCurrent(config);
    config._refreshVersion = refreshVersion;
    return axiosClient(config);
  },
);

function request<T>(method: string, url: string, data?: unknown, config?: RequestConfig): Promise<ApiEnvelope<T>> {
  const scopedConfig = { ...config, method, url, data, _session: sessionVersion };
  return axiosClient.request<ApiEnvelope<T>>(scopedConfig).then((response) => {
    assertCurrent(response.config);
    return response.data;
  });
}

export const apiClient = {
  get<T = unknown>(url: string, config?: RequestConfig) { return request<T>("get", url, undefined, config); },
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig) { return request<T>("post", url, data, config); },
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig) { return request<T>("put", url, data, config); },
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig) { return request<T>("patch", url, data, config); },
  delete<T = unknown>(url: string, config?: RequestConfig) { return request<T>("delete", url, config?.data, config); },
};
