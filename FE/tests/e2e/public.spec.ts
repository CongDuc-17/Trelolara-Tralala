import type { Route } from "@playwright/test";
import { test, expect } from "./fixture";

// Continuous trace capture competes with WebGL; inspect pixels and explicit screenshots instead.
test.use({ trace: "off" });

const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS" };
function send(route: Route, data: unknown, status = 200) {
  return route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers }) : route.fulfill({ status, headers, json: status < 400 ? { success: true, data } : { success: false, message: data } });
}

test("landing fits one screen with the supplied Dither Burn background", async ({ page, api }, info) => {
  api.authenticated = false;
  const modules: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".js")) modules.push(request.url()); });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: object) {
      return Reflect.apply(original, this, [kind, kind === "webgl2" ? { ...options, preserveDrawingBuffer: true } : options]);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Việc rõ ràng. Cả nhóm cùng tiến.");
  const image = page.locator(".public-backdrop-poster");
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Tạm dừng hiệu ứng" })).toHaveCount(0);
  expect(modules.some((url) => url.includes("DitherBurnCanvas-"))).toBe(false);
  const originalViewport = info.project.use.viewport!;
  const sizes = originalViewport.width < 640 ? [originalViewport, { width: 375, height: 667 }, { width: 375, height: 568 }, { width: 844, height: 390 }] : [originalViewport];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(size);
    const art = (await page.locator(".public-backdrop").boundingBox())!;
    expect(art).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    await expect(page.locator(".landing-hero-copy").getByRole("link", { name: "Bắt đầu", exact: true })).toBeInViewport();
  }
  await page.setViewportSize(originalViewport);
  await expect(page.locator("#landing-title")).toHaveCSS("animation-name", "none");
  if (originalViewport.width >= 1280) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const canvas = page.locator('.dither-burn-canvas[data-ready="true"]');
    await expect(canvas).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#landing-title")).toHaveCSS("animation-name", "public-arrive");
    const frame = () => canvas.evaluate((node: HTMLCanvasElement) => {
      const gl = node.getContext("webgl2")!;
      const pixels = new Uint8Array(node.width * node.height * 4);
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let min = 255, max = 0, hash = 0;
      for (let index = 0; index < pixels.length; index += 64) { min = Math.min(min, pixels[index]); max = Math.max(max, pixels[index]); hash = (hash * 31 + pixels[index]) | 0; }
      return { range: max - min, hash, pixels: node.width * node.height, error: gl.getError() };
    });
    const first = await frame();
    expect(first.range).toBeGreaterThan(20); expect(first.pixels).toBeLessThanOrEqual(1_503_000); expect(first.error).toBe(0);
    await expect.poll(async () => (await frame()).hash).not.toBe(first.hash);
    await page.getByRole("button", { name: "Tạm dừng hiệu ứng" }).click();
    await expect(page.getByRole("button", { name: "Tiếp tục hiệu ứng" })).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const pausedFrame = await frame();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect((await frame()).hash).toBe(pausedFrame.hash);
    await page.screenshot({ path: info.outputPath("dither-motion.jpg") });
    await canvas.evaluate((node: HTMLCanvasElement) => node.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext());
    await expect(page.locator(".dither-burn-canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tiếp tục hiệu ứng" })).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.screenshot({ path: info.outputPath("landing.jpg"), fullPage: true });
  await page.getByRole("button", { name: "Tùy chọn hiển thị" }).click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clear work. Shared progress.");
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(originalViewport.height);
  await page.locator(".landing-hero-copy").getByRole("link", { name: "Get started", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("login and registration share the background and form sizing while retaining failed drafts", async ({ page, api }, info) => {
  api.authenticated = false;
  await page.route("http://api.e2e.test/auth/register", (route) => send(route, "Chưa thể tạo tài khoản. Vui lòng thử lại.", 503));
  const widths: number[] = [];
  for (const path of ["/login", "/register"]) {
    await page.goto(path + "?returnTo=%2Fmy-work%3Fdue%3Dsoon");
    await expect(page.locator(".auth-form")).toBeVisible();
    await expect(page.locator(".public-backdrop-poster")).toHaveJSProperty("complete", true);
    expect(await page.locator(".public-backdrop").boundingBox()).toEqual({ x: 0, y: 0, width: info.project.use.viewport!.width, height: info.project.use.viewport!.height });
    widths.push((await page.locator(".access-card").boundingBox())!.width);
    const input = (await page.locator("#email").boundingBox())!, submit = (await page.locator('form button[type="submit"]').boundingBox())!;
    expect(input.height).toBeGreaterThanOrEqual(44); expect(submit.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(input.width - submit.width)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(path.slice(1) + "-clean.jpg"), fullPage: true });
    await page.locator("#email").fill("an@example.test"); await page.locator("#password").fill("fixture-password");
    if (path === "/register") {
      await page.locator("#name").fill("Nguyễn An"); await page.locator("#confirm-password").fill("fixture-password");
      await page.locator('form button[type="submit"]').click();
      await expect(page.getByRole("alert")).toHaveText("Chưa thể tạo tài khoản. Vui lòng thử lại.");
    }
    await expect(page.locator("#email")).toHaveValue("an@example.test"); await expect(page.locator("#password")).toHaveValue("fixture-password");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(info.project.use.viewport!.width);
    await page.screenshot({ path: info.outputPath(path.slice(1) + ".jpg"), fullPage: true });
  }
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
});

test("public pages remain usable when WebGL is unavailable", async ({ page, api }, info) => {
  api.authenticated = false;
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: object) { return kind === "webgl2" ? null : Reflect.apply(original, this, [kind, options]); } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const poster = page.locator(".public-backdrop-poster"); await expect(poster).toHaveJSProperty("complete", true);
    expect(await poster.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".dither-burn-canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tạm dừng hiệu ứng" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(info.project.use.viewport!.width);
  }
});

