import axios from "axios";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import i18n, { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/app/i18n";

axios.defaults.adapter = async () => {
  throw new Error("Unmocked Axios request blocked by test setup");
};

function setupBrowser() {
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  localStorage.removeItem(THEME_STORAGE_KEY);
  void i18n.changeLanguage("vi");
  document.documentElement.classList.remove("dark", "light");
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ matches: media.includes("prefers-reduced-motion: reduce"), media, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
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
