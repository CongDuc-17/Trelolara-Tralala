import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function reply<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { config, data, status, statusText: String(status), headers: {} };
}

export function httpError(config: InternalAxiosRequestConfig, status: number, message = "Request rejected") {
  return new AxiosError(message, "ERR_BAD_RESPONSE", config, undefined,
    reply(config, { success: false, message }, status));
}
