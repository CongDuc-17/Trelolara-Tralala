import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Tests must never inherit credentials or service URLs from a developer's .env.
    envDir: false,
    test: {
      environment: "jsdom",
      environmentOptions: {
        jsdom: { url: "http://localhost:5173/login" },
      },
      setupFiles: ["./src/test/setup.ts"],
      clearMocks: true,
      restoreMocks: true,
      unstubGlobals: true,
      env: {
        VITE_ENV: "test",
        VITE_API_BASE_URL: "http://api.test",
        VITE_WS_URL: "ws://api.test/ws",
      },
    },
  }),
);
