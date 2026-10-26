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
  const body: unknown = axios.isAxiosError(error) ? error.response?.data : undefined;
  const details = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof details.code === "string" ? details.code : undefined;
  const retryAfterSeconds = typeof details.retryAfterSeconds === "number" && Number.isInteger(details.retryAfterSeconds) && details.retryAfterSeconds > 0
    ? details.retryAfterSeconds : undefined;
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
  const messages: Record<string, string> = {
    MAIL_DELIVERY_FAILED: "auth.mailDeliveryFailed",
    REGISTRATION_PENDING: "auth.registrationPending",
    EMAIL_EXISTS: "auth.emailExists",
    ACCOUNT_UNVERIFIED: "auth.unverified",
    OTP_COOLDOWN: "auth.otpCooldown",
  };
  const message = code && messages[code] && (code !== "OTP_COOLDOWN" || retryAfterSeconds !== undefined)
    ? i18n.t(messages[code], { seconds: retryAfterSeconds }) : getErrorMessage(error, fallback);
  return { kind, status, code, retryAfterSeconds, message };
}
