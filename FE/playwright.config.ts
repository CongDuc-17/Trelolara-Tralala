import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["app.spec.ts", "project.spec.ts", "features.spec.ts", "public.spec.ts"],
  outputDir: "node_modules/.tmp/e2e-results",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "node_modules/.tmp/e2e-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-light", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
    { name: "tablet-light", use: { viewport: { width: 768, height: 1024 }, colorScheme: "light" } },
    { name: "tablet-dark", use: { viewport: { width: 768, height: 1024 }, colorScheme: "dark" } },
    { name: "phone-light", use: { viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true, hasTouch: true } },
    { name: "phone-dark", use: { viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --outDir node_modules/.tmp/e2e-dist --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
