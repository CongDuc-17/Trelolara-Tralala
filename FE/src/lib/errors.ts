import axios from "axios";
import { ConfigurationError } from "./env";
import i18n from "@/app/i18n";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string" &&
    error.response.data.message
  ) {
    return error.response.data.message;
  }

  return fallback;
}


export function getApiError(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const kind = axios.isCancel(error) ? "canceled"
    : error instanceof ConfigurationError ? "configuration"
    : status === 401 ? "unauthorized"
    : status === 403 ? "forbidden"
    : status === 404 ? "not-found"
    : status === 409 ? "conflict"
    : status === 422 || status === 400 ? "validation"
    : axios.isAxiosError(error) && ["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "") ? "timeout"
    : axios.isAxiosError(error) && !error.response ? "network"
    : "unknown";
  const fallback = kind === "configuration" && error instanceof Error ? error.message
    : i18n.t(`errors.${["network", "timeout", "forbidden", "unauthorized"].includes(kind) ? kind : "fallback"}`);
  return { kind, status, message: getErrorMessage(error, fallback) };
}
