import type { Route } from "@playwright/test";
import { test, expect } from "./fixture";
import type { CardAttachment, Label } from "../../src/features/cards/types";

const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS" };
function send(route: Route, data: unknown, status = 200) {
  return route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers }) : route.fulfill({ status, headers, json: status < 400 ? { success: true, data } : { success: false, message: data } });
}
test.beforeEach(async ({ api }) => { expect(api.authenticated).toBe(true); });

test("summary and settings are centered while wide task filters share one row", async ({ page }, info) => {
  await page.goto("/dashboard");
  const summary = page.locator(".app-summary");
  await expect(summary.locator("dl > div")).toHaveCount(2);
  const boxes = await summary.locator("dl > div").evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { x: box.x, right: box.right }; }));
  expect(boxes).toHaveLength(2);
  const summaryBox = (await summary.boundingBox())!;
  expect(Math.abs((Math.min(...boxes.map((box) => box.x)) + Math.max(...boxes.map((box) => box.right))) / 2 - summaryBox.x - summaryBox.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((boxes[0].right - boxes[0].x) - (boxes[1].right - boxes[1].x))).toBeLessThanOrEqual(1);
  expect(boxes[0].right - boxes[0].x).toBeGreaterThan(summaryBox.width * 0.4);
  await page.goto("/me");
  const form = (await page.locator(".profile-form").boundingBox())!;
  const content = (await page.locator(".profile-page").boundingBox())!;
  expect(Math.abs(form.x + form.width / 2 - content.x - content.width / 2)).toBeLessThanOrEqual(1);
  await page.goto("/my-work");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.locator(".task-summary dd").first()).toHaveText("3");
  if (info.project.use.viewport!.width >= 1280) {
    await page.locator("#dashboard-context-close").click();
    const search = (await page.getByRole("searchbox").boundingBox())!;
    const due = (await page.locator(".task-filters [data-slot=toggle-group]").boundingBox())!;
    expect(search.width).toBeGreaterThan(320);
    expect(Math.abs(search.y + search.height / 2 - due.y - due.height / 2)).toBeLessThanOrEqual(1);
    const filters = (await page.locator(".task-filters").boundingBox())!;
    expect(Math.abs(due.x + due.width - (filters.x + filters.width - 14))).toBeLessThanOrEqual(2);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".app-page")).toHaveCSS("animation-name", "workspace-enter");
    await page.getByRole("button", { name: "Bộ lọc", exact: true }).click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".app-page")).toHaveCSS("animation-name", "none");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(info.project.use.viewport!.width);
  await page.screenshot({ path: info.outputPath("centered-filters.jpg") });
  if (info.project.use.viewport!.width < 640) {
    for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await expect(page.getByRole("searchbox")).toBeVisible();
      await expect(page.getByText("Trong 24 giờ", { exact: true })).toBeVisible();
    }
  }
});

test("attachments retain failed selections and activity paginates through the card API", async ({ page, api }, info) => {
  let failedUpload = false;
  const files: CardAttachment[] = [{ id: "legacy", cardId: "c1", userId: api.user.id, fileName: "tai-lieu-cu.pdf", fileSize: 2048, mimeType: "application/pdf", createdAt: "2026-10-23T03:00:00Z", downloadUrl: null }];
  api.cards[0]._count.attachments = files.length;
  await page.addInitScript(() => { window.open = () => null; });
  await page.route("http://api.e2e.test/cards/c1/attachments**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return send(route, null);
    if (path.endsWith("/download")) return send(route, { url: "https://files.example.test/signed-download", expiresAt: "2050-01-01T00:00:00Z" });
    if (request.method() === "POST") {
      if (!failedUpload) { failedUpload = true; return send(route, "Không thể lưu tệp lúc này.", 503); }
      expect(request.postDataBuffer()?.toString()).toContain('name="file"');
      const file = { ...files[0], id: "new-file", fileName: "ke-hoach.png", mimeType: "image/png", downloadUrl: "/cards/c1/attachments/new-file/download" };
      files.push(file); api.cards[0]._count.attachments = files.length; return send(route, file, 201);
    }
    if (request.method() === "DELETE") { files.splice(files.findIndex((file) => file.id === path.split("/").at(-1)), 1); api.cards[0]._count.attachments = files.length; return send(route, null); }
    return send(route, files);
  });
  const event = (id: string, action: string) => ({ id, cardId: "c1", userId: api.user.id, actor: api.user, action, details: null, metadata: {}, createdAt: "2026-10-23T03:00:00Z" });
  await page.route("http://api.e2e.test/cards/c1/activities**", (route) => {
    const older = new URL(route.request().url()).searchParams.has("cursor");
    return send(route, { items: older ? [event("e2", "updated"), event("e1", "created")] : [event("e3", "attachment_added"), event("e2", "updated")], nextCursor: older ? null : "older" });
  });
  await page.goto("/boards/board");
  await expect(page.locator('[data-card-id="c1"]').getByRole("img", { name: "1 tệp đính kèm" })).toBeVisible();
  expect(api.calls.some((call) => call.path.includes("/attachments"))).toBe(false);
  await page.locator("#board-card-c1").click();
  const filesSection = page.locator("details").filter({ has: page.locator("summary", { hasText: "Tệp đính kèm" }) });
  await filesSection.locator("summary").click();
  await expect(filesSection.getByRole("button", { name: "Tải xuống tai-lieu-cu.pdf", exact: true })).toBeDisabled();
  await filesSection.getByLabel("Chọn tệp", { exact: true }).setInputFiles({ name: "ke-hoach.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kMj8AAAAASUVORK5CYII=", "base64") });
  await filesSection.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(filesSection.getByRole("alert")).toHaveText("Không thể lưu tệp lúc này.");
  await expect(filesSection.getByText("ke-hoach.png", { exact: true })).toBeVisible();
  await filesSection.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(filesSection.getByRole("status")).toContainText("Đã thêm tệp");
  await expect(page.locator('[data-card-id="c1"] [role="img"][aria-label="2 tệp đính kèm"]')).toHaveCount(1);
  await expect(filesSection.locator("summary")).toContainText("2");
  await filesSection.getByRole("button", { name: "Tải xuống ke-hoach.png", exact: true }).click();
  await expect(filesSection.getByRole("link", { name: "Mở liên kết tải xuống" })).toHaveAttribute("href", "https://files.example.test/signed-download");
  await filesSection.getByRole("button", { name: "Xóa tệp ke-hoach.png", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa", exact: true }).click();
  await expect.poll(() => files.length).toBe(1);
  await expect(page.locator('[data-card-id="c1"] [role="img"][aria-label="1 tệp đính kèm"]')).toHaveCount(1);
  const activities = page.locator("details").filter({ has: page.locator("summary", { hasText: "Lịch sử hoạt động" }) });
  await activities.locator("summary").click();
  await expect(activities.locator("ol li")).toHaveCount(2);
  await activities.getByRole("button", { name: "Xem hoạt động cũ hơn" }).click();
  await expect(activities.locator("ol li")).toHaveCount(3);
  await expect(activities.getByText(/đã tạo thẻ/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("card-resources.jpg") });
  await page.getByRole("dialog").getByRole("button", { name: "Đóng", exact: true }).click();
  await page.goto("/my-work");
  await expect(page.locator(".task-row").first().getByRole("img", { name: "1 tệp đính kèm" })).toBeVisible();
});

test("board information, people lookup, share links and marking all notifications read use real controls", async ({ page, api }, info) => {
  await page.route(/^http:\/\/api\.e2e\.test\/users(?:\?|$)/, async (route) => {
    if (route.request().method() === "OPTIONS") return send(route, null);
    return route.fulfill({ headers, json: { success: true, data: [api.user], pagination: { currentPage: 1, totalPages: 1, itemsPerPage: 10, totalItems: 1 } } });
  });
  await page.route(`http://api.e2e.test/users/${api.user.id}`, (route) => send(route, api.user));
  await page.route("http://api.e2e.test/invitations/boards/board/share-link", (route) => send(route, { id: "invite", token: "shared-token", type: "LINK", roleId: "admin", expiresAt: "2050-01-01T00:00:00Z", delivery: { email: "NOT_APPLICABLE", notification: "NOT_APPLICABLE" } }));
  await page.goto("/boards/board");
  await page.getByRole("button", { name: "Thông tin bảng", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Thông tin bảng" });
  await details.getByLabel("Mô tả", { exact: true }).fill("Thông tin được cập nhật từ giao diện.");
  await details.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect.poll(() => api.board.description).toBe("Thông tin được cập nhật từ giao diện.");
  await page.getByRole("button", { name: "Thành viên bảng", exact: true }).click();
  await page.getByRole("button", { name: "Chọn người dùng", exact: true }).click();
  const people = page.getByRole("dialog", { name: "Tìm người dùng" });
  await people.getByRole("button", { name: "Xem hồ sơ", exact: true }).click();
  await expect(people.getByText(api.user.bio)).toBeVisible();
  await people.getByRole("button", { name: `Chọn ${api.user.name}`, exact: true }).click();
  const members = page.getByRole("dialog", { name: "Thành viên bảng" });
  await expect(members.getByLabel("Email thành viên mới")).toHaveValue(api.user.email);
  await members.getByText("Qua liên kết", { exact: true }).click();
  await members.getByRole("combobox", { name: "Vai trò lời mời" }).click();
  await page.getByRole("option", { name: "Quản trị viên", exact: true }).click();
  await members.getByRole("button", { name: "Tạo liên kết", exact: true }).click();
  await expect(members.getByLabel("Liên kết mời", { exact: true })).toHaveValue("http://127.0.0.1:4173/invite/boards/shared-token");
  await page.screenshot({ path: info.outputPath("share-link.jpg") });
  await members.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "Đóng", exact: true }).click();
  await page.getByRole("button", { name: "Thông báo, 12 chưa đọc" }).click();
  await page.getByRole("button", { name: "Đánh dấu tất cả đã đọc", exact: true }).click();
  await expect.poll(() => api.notifications.every((notification) => notification.isRead)).toBe(true);
  await expect(page.getByRole("button", { name: "Thông báo", exact: true })).toBeVisible();
});

test("checklist titles and items can be edited and labels are deleted only after confirmation", async ({ page, api }, info) => {
  const checklist = { id: "checklist", title: "Nghiệm thu", checklistItems: [{ id: "item", title: "Thu thập yêu cầu", completed: false }] };
  api.cards[0].checklists = [checklist];
  const labels: Label[] = [{ id: "label", name: "Cần duyệt", color: "#ef4444" }];
  api.cards[0].cardLabels = [{ id: "assignment", label: labels[0] }];
  await page.route("http://api.e2e.test/checklists/checklist", async (route) => { if (route.request().method() === "PATCH") Object.assign(checklist, route.request().postDataJSON()); return send(route, checklist); });
  await page.route("http://api.e2e.test/checklist-items/item", async (route) => { if (route.request().method() === "PATCH") Object.assign(checklist.checklistItems[0], route.request().postDataJSON()); if (route.request().method() === "DELETE") checklist.checklistItems = []; return send(route, null); });
  await page.route("http://api.e2e.test/boards/board/labels", (route) => send(route, labels));
  await page.route("http://api.e2e.test/labels/label", async (route) => { if (route.request().method() === "DELETE") { labels.splice(0); api.cards[0].cardLabels = []; } return send(route, null); });
  await page.goto("/boards/board/cards/c1");
  const region = page.getByRole("region", { name: "Nghiệm thu", exact: true });
  await region.getByRole("button", { name: "Đổi tên Nghiệm thu", exact: true }).click();
  await region.getByLabel("Tên checklist", { exact: true }).fill("Nghiệm thu mới");
  await region.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect.poll(() => checklist.title).toBe("Nghiệm thu mới");
  const updated = page.getByRole("region", { name: "Nghiệm thu mới", exact: true });
  await updated.getByRole("button", { name: "Sửa mục Thu thập yêu cầu", exact: true }).click();
  await updated.getByLabel("Nội dung mục checklist", { exact: true }).fill("Xác nhận yêu cầu");
  await updated.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await updated.getByRole("button", { name: "Xóa mục Xác nhận yêu cầu", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa", exact: true }).click();
  await expect.poll(() => checklist.checklistItems.length).toBe(0);
  await page.getByRole("button", { name: "Nhãn của thẻ", exact: true }).click();
  await page.getByRole("button", { name: "Sửa nhãn Cần duyệt", exact: true }).click();
  await page.getByRole("button", { name: "Xóa nhãn khỏi bảng", exact: true }).click();
  await expect.poll(() => labels.length).toBe(1);
  await page.getByRole("alertdialog").getByRole("button", { name: "Hủy", exact: true }).click();
  await expect.poll(() => labels.length).toBe(1);
  await page.getByRole("button", { name: "Xóa nhãn khỏi bảng", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa", exact: true }).click();
  await expect.poll(() => labels.length).toBe(0);
  await page.screenshot({ path: info.outputPath("checklist-labels.jpg") });
});
