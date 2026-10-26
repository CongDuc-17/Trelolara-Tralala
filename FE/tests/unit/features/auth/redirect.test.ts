import { afterEach, expect, it } from "vitest";
import { authLink, safeReturnTo, saveOAuthReturnTo, takeOAuthReturnTo } from "@/features/auth/redirect";

afterEach(() => sessionStorage.clear());
it.each([null, "https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/%2f%2fevil.test", "/login", "/LOGIN/", "/verify/", "/foo/../login", "/", "/%00evil", "/%invalid"])(
  "rejects an unsafe or looping return destination %#", (value) => expect(safeReturnTo(value)).toBe("/dashboard"),
);
it("preserves a deep link, query and fragment across auth pages", () => {
  const path = "/boards/test/cards/card?label=red#comments";
  expect(safeReturnTo(path)).toBe(path);
  expect(new URL(authLink("/verify", path), "https://app.test").searchParams.get("returnTo")).toBe(path);
});
it("consumes a validated OAuth return destination only once", () => {
  saveOAuthReturnTo("/boards/test/cards/card");
  expect(takeOAuthReturnTo()).toBe("/boards/test/cards/card");
  expect(takeOAuthReturnTo()).toBeNull();
});
it.each(["invalid", JSON.stringify({ path: "//evil.test", expiresAt: 1 }), JSON.stringify({ path: "/boards/test", expiresAt: "invalid" })])(
  "discards malformed or expired OAuth state %#", (value) => {
    sessionStorage.setItem("oauth-return-to", value);
    expect(takeOAuthReturnTo()).toBeNull();
  },
);
