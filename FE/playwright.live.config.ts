import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("e2e-live", process.cwd(), "");
for (const key of ["VITE_API_BASE_URL", "VITE_WS_URL", "E2E_USER_EMAIL", "E2E_USER_PASSWORD", "E2E_SECOND_EMAIL", "E2E_SECOND_PASSWORD"]) {
  if (!env[key]) throw new Error(`Missing ${key}; fill .env.e2e-live.local using the example.`);
}
if (env.E2E_USER_EMAIL === env.E2E_SECOND_EMAIL) throw new Error("Live checks need two distinct verified test accounts.");

let reuseVerifiedServer = false;
try {
  const [screen, transport] = await Promise.all([
    fetch("http://localhost:5173/src/App.tsx", { signal: AbortSignal.timeout(10_000) }),
    fetch("http://localhost:5173/src/lib/env.ts", { signal: AbortSignal.timeout(10_000) }),
  ]);
  const [source, settings] = await Promise.all([screen.text(), transport.text()]);
  reuseVerifiedServer = screen.ok && transport.ok && source.includes("/src/app/RouteBoundary") && source.includes("/src/pages/Board") && settings.includes(env.VITE_API_BASE_URL);
} catch { /* A free port will be served by the isolated preview below. */ }

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "live.spec.ts",
  outputDir: "node_modules/.tmp/e2e-live-results",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "node_modules/.tmp/e2e-live-report.json" }]],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    viewport: { width: 1440, height: 900 },
    contextOptions: { reducedMotion: "reduce" },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --outDir node_modules/.tmp/e2e-live-dist --host localhost --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: reuseVerifiedServer,
    timeout: 30_000,
  },
});
