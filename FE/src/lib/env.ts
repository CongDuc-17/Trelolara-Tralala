export class ConfigurationError extends Error {}

export function parseApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConfigurationError("Thiếu VITE_API_BASE_URL. Hãy kiểm tra cấu hình FE.");
  }
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url.href.replace(/\/$/, "");
  } catch {
    throw new ConfigurationError("VITE_API_BASE_URL phải là URL HTTP/HTTPS hợp lệ.");
  }
}

export function getApiBaseUrl() {
  return parseApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
}
