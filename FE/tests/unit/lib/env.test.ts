import { expect, it } from "vitest";
import { parseApiBaseUrl } from "@/lib/env";

it.each([undefined, "", "  ", "/api", "ftp://api.test", "https://user:secret@api.test", "https://api.test?token=test", "https://api.test#fragment"])(
  "rejects invalid API configuration %#", (value) => expect(() => parseApiBaseUrl(value)).toThrow("VITE_API_BASE_URL"),
);
it("normalizes an absolute HTTP URL without dropping an API path", () => {
  expect(parseApiBaseUrl(" https://api.test/v1/ ")).toBe("https://api.test/v1");
});
