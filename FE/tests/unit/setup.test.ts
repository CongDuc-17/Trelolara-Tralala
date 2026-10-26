import axios from "axios";
import { expect, it } from "vitest";

it("uses isolated test URLs instead of a developer's environment", () => {
  expect(import.meta.env.VITE_ENV).toBe("test");
  expect(import.meta.env.VITE_API_BASE_URL).toBe("http://api.test");
  expect(import.meta.env.VITE_WS_URL).toBe("ws://api.test/ws");
});

it("blocks unmocked browser and Axios traffic", async () => {
  await expect(axios.create().get("http://api.test/unmocked"))
    .rejects.toThrow("Unmocked Axios request blocked");
  await expect(fetch("http://api.test/unmocked"))
    .rejects.toThrow("Unmocked fetch blocked");
  expect(() => new XMLHttpRequest()).toThrow("Unmocked XMLHttpRequest blocked");
  expect(() => new WebSocket("ws://api.test/ws"))
    .toThrow("Unmocked WebSocket blocked");
});
