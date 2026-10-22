import axios from "axios";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

axios.defaults.adapter = async () => {
  throw new Error("Unmocked Axios request blocked by test setup");
};

function setupBrowser() {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => null) });
  // jsdom has no layout engine; size-dependent UI needs browser verification in milestone E.
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("Unmocked fetch blocked by test setup");
  }));
  vi.stubGlobal("XMLHttpRequest", class {
    constructor() {
      throw new Error("Unmocked XMLHttpRequest blocked by test setup");
    }
  });
  vi.stubGlobal("WebSocket", class {
    constructor() {
      throw new Error("Unmocked WebSocket blocked by test setup");
    }
  });
}

setupBrowser();
beforeEach(setupBrowser);
afterEach(cleanup);
