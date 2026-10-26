import { describe, expect, it } from "vitest";
import { getApiError, getErrorMessage } from "@/lib/errors";
import { AxiosError, AxiosHeaders, CanceledError } from "axios";
import { ConfigurationError } from "@/lib/env";
import { httpError } from "../../support/helpers";
import i18n from "@/app/i18n";

describe("getErrorMessage", () => {
  it("reads a backend message without exposing transport internals", () => {
    expect(getErrorMessage(
      { response: { data: { success: false, message: "Tên bảng đã tồn tại" } } },
      "Error creating board",
    )).toBe("Tên bảng đã tồn tại");
  });

  const malformedErrors: unknown[] = [
    undefined, null, "error", 42, new Error("Network Error"), {},
    { response: null },
    { response: { data: null } },
    { response: { data: "Bad gateway" } },
    { response: { data: {} } },
    { response: { data: { message: "" } } },
    { response: { data: { message: { detail: "private" } } } },
    { response: { data: { message: ["invalid"] } } },
  ];

  it.each(malformedErrors)("uses the caller's fallback for malformed error %#", (error) => {
    expect(getErrorMessage(error, "Registration failed"))
      .toBe("Registration failed");
  });
});

it.each([
  [401, "unauthorized"], [403, "forbidden"], [404, "not-found"],
  [409, "conflict"], [422, "validation"], [500, "unknown"],
])("classifies HTTP %s while preserving its server message", (status, kind) => {
  const issue = getApiError(httpError({ headers: new AxiosHeaders() }, Number(status), "Backend message"));
  expect(issue).toMatchObject({ kind, status, message: "Backend message" });
});
it("separates cancellation, timeout, network and configuration failures", () => {
  expect(getApiError(new CanceledError()).kind).toBe("canceled");
  expect(getApiError(new AxiosError("timeout", "ECONNABORTED")).kind).toBe("timeout");
  expect(getApiError(new AxiosError("offline", "ERR_NETWORK")).kind).toBe("network");
  expect(getApiError(new ConfigurationError("VITE_API_BASE_URL"))).toMatchObject({ kind: "configuration", message: "VITE_API_BASE_URL" });
});

it("translates transport fallbacks while preserving the backend's actual message", async () => {
  await i18n.changeLanguage("en");
  expect(getApiError(new AxiosError("offline", "ERR_NETWORK")).message).toBe("Could not connect to the server. Please try again.");
  expect(getApiError(httpError({ headers: new AxiosHeaders() }, 409, "Tên đã tồn tại")).message).toBe("Tên đã tồn tại");
});
