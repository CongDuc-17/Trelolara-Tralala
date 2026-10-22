const authPaths = new Set(["/login", "/register", "/verify", "/forgot-password"]);
export function isAuthPath(path: string) { return authPaths.has(path.replace(/\/+$/, "").toLowerCase()); }

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\") ||
      Array.from(decoded).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "/dashboard";
    const url = new URL(value, "https://app.test");
    if (url.origin !== "https://app.test" || isAuthPath(url.pathname) || url.pathname === "/") return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch { return "/dashboard"; }
}

export function authLink(path: string, returnTo: string) {
  return `${path}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

const OAUTH_RETURN_KEY = "oauth-return-to";
export function saveOAuthReturnTo(path: string) {
  sessionStorage.setItem(OAUTH_RETURN_KEY, JSON.stringify({ path: safeReturnTo(path), expiresAt: Date.now() + 15 * 60_000 }));
}
export function takeOAuthReturnTo(): string | null {
  const raw = sessionStorage.getItem(OAUTH_RETURN_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_KEY);
  if (!raw) return null;
  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved === "object" && saved !== null && "path" in saved &&
      "expiresAt" in saved && typeof saved.expiresAt === "number" && saved.expiresAt > Date.now()) {
      return safeReturnTo(saved.path);
    }
  } catch { /* A malformed saved redirect is discarded. */ }
  return null;
}
