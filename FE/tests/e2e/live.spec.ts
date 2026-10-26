import { randomUUID } from "node:crypto";
import { test, expect, request as apiRequest, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("e2e-live", process.cwd(), "");
const api = env.VITE_API_BASE_URL.replace(/\/$/, "");
const app = "http://localhost:5173";

function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an API record");
}

async function request(context: APIRequestContext, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: Record<string, unknown>) {
  const response = await context.fetch(api + path, { method, data, timeout: 15_000 });
  expect(response.status(), `${method} ${path} status`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `${method} ${path} status`).toBeLessThan(300);
  const body: unknown = await response.json(); record(body);
  expect(body.success, `${method} ${path} envelope`).toBe(true);
  return body.data;
}

async function row(context: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: Record<string, unknown>) {
  const result = await request(context, method, path, data); record(result); return result;
}

function id(value: Record<string, unknown>) {
  if (typeof value.id !== "string" || !/^[a-f0-9-]{36}$/i.test(value.id)) throw new Error("Missing resource UUID");
  return value.id;
}

async function login(page: Page, email: string, password: string) {
  await page.goto(app + "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator("#password").fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url() === api + "/auth/login" && response.request().method() === "POST"),
    page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
  ]);
  expect(response.status(), "Verified test account login status").toBe(200);
  await expect(page).toHaveURL(app + "/dashboard");
  await expect(page.getByRole("heading", { name: "Tổng quan công việc" })).toBeVisible();
}

async function createLinkThroughUI(page: Page, scope: "projects" | "boards", resourceId: string) {
  await page.goto(`${app}/${scope}/${resourceId}`);
  await page.getByRole("button", { name: scope === "projects" ? "Thành viên dự án" : "Thành viên bảng", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Qua liên kết", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Vai trò lời mời" }).click();
  await page.getByRole("option", { name: /^(Người xem|Thành viên|Biên tập viên)$/ }).first().click();
  await dialog.getByRole("button", { name: "Tạo liên kết", exact: true }).click();
  const link = dialog.getByLabel("Liên kết mời", { exact: true });
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  expect(url.startsWith(`${app}/invite/${scope}/`), "Generated link stays on the application origin").toBe(true);
  return url;
}

let cleanupTask: ((info: TestInfo) => Promise<void>) | undefined;
test.afterEach(async () => {
  test.setTimeout(60_000);
  try { await cleanupTask?.(test.info()); } finally { cleanupTask = undefined; }
});

test("two verified users collaborate through the real API, cookies, board revisions and reminder worker", async ({ page, context, browser }) => {
  const secondContext = await browser.newContext({ baseURL: app, viewport: { width: 1440, height: 900 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", reducedMotion: "reduce" });
  const second = await secondContext.newPage();
  const prefix = "M7-E2E-" + randomUUID().slice(0, 8);
  const evidence = { resourcePrefix: prefix, completed: [] as string[], cleanup: [] as string[] };
  let projectId = ""; let boardId = ""; let cardId = "";
  let cleanupSession: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  cleanupTask = async (info) => {
    // A separate request context lets teardown run even after the UI test times out.
    const cleanup = await apiRequest.newContext({ storageState: cleanupSession });
    try {
      if (projectId) {
        const owned = await row(cleanup, "GET", `/projects/${projectId}`);
        expect(owned.name === prefix, "Cleanup project identity").toBe(true);
        if (boardId) {
          const board = await row(cleanup, "GET", `/boards/${boardId}`);
          expect(board.projectId === projectId && board.name === prefix + " Board", "Cleanup board identity").toBe(true);
          await request(cleanup, "PATCH", `/boards/${boardId}/archive`);
          await request(cleanup, "DELETE", `/boards/${boardId}`);
          evidence.cleanup.push("Deleted only the board created by this run and its child data.");
        }
        await request(cleanup, "PATCH", `/projects/${projectId}/archive`);
        await request(cleanup, "DELETE", `/projects/${projectId}`);
        evidence.cleanup.push("Soft-deleted the uniquely named project using the existing project retention policy.");
      }
    } catch {
      evidence.cleanup.push("Cleanup incomplete; the namespaced test project needs inspection.");
      expect.soft(false, "Cleanup could not complete through the existing API").toBe(true);
    } finally {
      await cleanup.dispose();
      await info.attach("live-verification", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    }
  };
  let reminderSocketReceived = false;
  const boardEvents: string[] = [];
  second.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => {
    try {
      const message: unknown = JSON.parse(String(payload)); record(message); record(message.data);
      if (message.data.boardId === boardId && typeof message.event === "string" && typeof message.data.revision === "string") boardEvents.push(message.event);
      if (message.event === "notification:new" && message.data.type === "CARD_DUE_SOON" && message.data.entityId === cardId) reminderSocketReceived = true;
    } catch { /* Only board revision event names are retained as evidence. */ }
  }));
  try {
    await test.step("authenticate both accounts through the browser", async () => {
      await login(page, env.E2E_USER_EMAIL, env.E2E_USER_PASSWORD);
      cleanupSession = await context.storageState();
      await login(second, env.E2E_SECOND_EMAIL, env.E2E_SECOND_PASSWORD);
      evidence.completed.push("Two independent browser sessions authenticated with real cookies and CORS.");
    });
    const actor = await row(context.request, "GET", "/users/me");
    const recipient = await row(secondContext.request, "GET", "/users/me");
    const project = await row(context.request, "POST", "/projects", { name: prefix }); projectId = id(project);
    const board = await row(context.request, "POST", `/projects/${projectId}/boards`, { name: prefix + " Board" }); boardId = id(board);
    const firstList = await row(context.request, "POST", `/boards/${boardId}/lists`, { name: "Cần thực hiện" });
    const secondList = await row(context.request, "POST", `/boards/${boardId}/lists`, { name: "Đang thực hiện" });
    const card = await row(context.request, "POST", `/lists/${id(firstList)}/cards`, { title: prefix + " Card" }); cardId = id(card);
    evidence.completed.push("Created a namespaced project, board, two lists and card through existing APIs.");
    await test.step("accept a share link without sending email", async () => {
      const projectLink = await createLinkThroughUI(page, "projects", projectId);
      await second.goto(projectLink);
      await second.getByRole("button", { name: "Chấp nhận", exact: true }).click();
      await expect(second).toHaveURL(app + "/dashboard");
      evidence.completed.push("Second account accepted an explicit LINK invitation through the FE; no SMTP was requested.");
      const boardLink = await createLinkThroughUI(page, "boards", boardId);
      await second.goto(boardLink);
      await second.getByRole("button", { name: "Chấp nhận", exact: true }).click();
      await expect(second).toHaveURL(app + "/dashboard");
      evidence.completed.push("Second account accepted a board LINK invitation before being assigned to the card.");
    });
    await request(context.request, "POST", `/cards/${cardId}/members`, { userId: id(actor) });
    await request(context.request, "POST", `/cards/${cardId}/members`, { userId: id(recipient) });
    await page.goto(app + `/boards/${boardId}`);
    await second.goto(app + `/boards/${boardId}`);
    await expect(second.locator(`#board-card-${cardId}`)).toContainText(prefix + " Card");
    await expect.poll(() => boardEvents.includes("board:subscribed")).toBe(true);
    await test.step("persist a card edit and observe another browser update", async () => {
      const changes = boardEvents.filter((event) => event === "board:changed").length;
      await page.locator(`#board-card-${cardId}`).click();
      await page.locator("#card-title").fill(prefix + " Updated");
      await page.locator("#description").fill("Kiểm thử tích hợp M7; chỉ dữ liệu của lần chạy này.");
      await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
      await expect.poll(async () => (await row(context.request, "GET", `/cards/${cardId}`)).title).toBe(prefix + " Updated");
      await expect.poll(() => boardEvents.filter((event) => event === "board:changed").length).toBeGreaterThan(changes);
      await expect(second.locator(`#board-card-${cardId}`)).toContainText(prefix + " Updated");
      evidence.completed.push("Card title/description persisted and the second browser refreshed from board revision events.");
      await page.getByRole("button", { name: "Đóng", exact: true }).click();
    });
    await test.step("move the card with the keyboard and verify its real parent", async () => {
      const target = page.locator(`#board-card-${cardId}`);
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page).toHaveURL(app + `/boards/${boardId}`);
      await target.focus();
      await expect(target).toBeFocused();
      await page.keyboard.press("Space");
      await expect(page.locator('[data-board-dragging="true"]')).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.keyboard.press("Space");
      await expect.poll(async () => (await row(context.request, "GET", `/cards/${cardId}`)).listId).toBe(id(secondList));
      await expect(second.locator(`[data-list-id="${id(secondList)}"] #board-card-${cardId}`)).toBeVisible();
      evidence.completed.push("Keyboard drag persisted across lists and appeared in the second browser.");
    });
    await test.step("edit board information and manage a private attachment through the new UI", async () => {
      await page.getByRole("button", { name: "Thông tin bảng", exact: true }).click();
      const information = page.getByRole("dialog", { name: "Thông tin bảng" });
      await information.getByLabel("Mô tả", { exact: true }).fill("Thông tin kiểm thử của " + prefix);
      await information.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
      await expect.poll(async () => (await row(context.request, "GET", `/boards/${boardId}`)).description).toBe("Thông tin kiểm thử của " + prefix);
      await page.locator(`#board-card-${cardId}`).click();
      const files = page.locator("details").filter({ has: page.locator("summary", { hasText: "Tệp đính kèm" }) });
      await files.locator("summary").click();
      const fileName = prefix + "-attachment.png";
      await files.getByLabel("Chọn tệp", { exact: true }).setInputFiles({ name: fileName, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kMj8AAAAASUVORK5CYII=", "base64") });
      await files.getByRole("button", { name: "Tải lên", exact: true }).click();
      await expect(files.getByText("Đã thêm tệp đính kèm.", { exact: true })).toBeVisible();
      await expect(page.locator(`[data-card-id="${cardId}"] [role="img"][aria-label="1 tệp đính kèm"]`)).toHaveCount(1);
      expect((await row(context.request, "GET", `/cards/${cardId}`)).attachmentCount).toBe(1);
      const attachments = await request(context.request, "GET", `/cards/${cardId}/attachments`);
      if (!Array.isArray(attachments)) throw new Error("Expected attachment list");
      const attachment: unknown = attachments.find((value: unknown) => { record(value); return value.fileName === fileName; }); record(attachment);
      const attachmentId = id(attachment);
      const download = await row(context.request, "GET", `/cards/${cardId}/attachments/${attachmentId}/download`);
      if (typeof download.url !== "string" || new URL(download.url).protocol !== "https:") throw new Error("Expected a signed HTTPS download");
      try {
        const response = await context.request.get(download.url, { timeout: 15_000 });
        expect(response.status(), "Signed attachment is downloadable").toBe(200);
      } catch { throw new Error("The signed attachment could not be downloaded"); }
      await files.getByRole("button", { name: `Xóa tệp ${fileName}`, exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Xóa", exact: true }).click();
      await expect.poll(async () => {
        const remaining = await request(context.request, "GET", `/cards/${cardId}/attachments`);
        return Array.isArray(remaining) && !remaining.some((value: unknown) => { record(value); return value.id === attachmentId; });
      }).toBe(true);
      await expect(page.locator(`[data-card-id="${cardId}"] [role="img"][aria-label="1 tệp đính kèm"]`)).toHaveCount(0);
      const history = page.locator("details").filter({ has: page.locator("summary", { hasText: "Lịch sử hoạt động" }) });
      await history.locator("summary").click();
      await expect(history.getByText(/đã xóa tệp đính kèm/)).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Đóng", exact: true }).click();
      evidence.completed.push("Board description persisted; a namespaced PNG uploaded through FE, downloaded through its signed URL and was deleted through FE; activity history showed the deletion.");
    });
    await test.step("display the assignment in My work and board search", async () => {
      await page.goto(app + "/my-work");
      await expect(page.locator(`#task-link-${cardId}`)).toBeVisible();
      await page.goto(app + `/boards/${boardId}/search?q=` + encodeURIComponent(prefix));
      await expect(page.locator(`#task-link-${cardId}`)).toBeVisible();
      evidence.completed.push("Actor-scoped My work and board search returned the real assigned card.");
    });
    await test.step("receive a persisted due notification from the running worker", async () => {
      const dueDate = new Date(Date.now() + 3_600_000 + 10_000).toISOString();
      await row(context.request, "PATCH", `/cards/${cardId}`, { dueDate, reminderMinutesBefore: 60, isComplete: false });
      await expect.poll(async () => {
        const data = await request(secondContext.request, "GET", "/notifications?isRead=false&limit=100&page=1");
        return Array.isArray(data) && data.some((item: unknown) => { record(item); return item.type === "CARD_DUE_SOON" && item.entityId === cardId; });
      }, { timeout: 75_000, intervals: [1000, 3000, 5000] }).toBe(true);
      await expect.poll(() => reminderSocketReceived).toBe(true);
      await second.getByRole("button", { name: /^Thông báo/ }).click();
      await expect(second.locator('[data-slot="popover-content"] a').filter({ hasText: "Nhắc hạn công việc" }).filter({ hasText: prefix })).toBeVisible();
      evidence.completed.push("The real reminder worker persisted a private notification and the second browser displayed it.");
    });
  } finally {
    await secondContext.close();
  }
});
