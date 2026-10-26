import { test, expect } from "./fixture";

test("project details share the dashboard surfaces and preserve project and board actions", async ({ page, api }, info) => {
  Object.assign(api.project, { description: "Tổ chức kế hoạch, thiết kế và phát triển sản phẩm cùng nhóm." });
  const boards = [
    { ...api.board, description: "Theo dõi các hạng mục đang phát triển và chuẩn bị phát hành." },
    { ...api.board, id: "planning", name: "Kế hoạch và nghiên cứu", description: "Ý tưởng, mục tiêu và công việc tiếp theo.", membersCount: 0, listsCount: 0 },
    { ...api.board, id: "design", name: "Thiết kế trải nghiệm người dùng", description: "Luồng thao tác và các màn hình của sản phẩm.", listsCount: 4 },
    { ...api.board, id: "past", name: "Tài liệu giai đoạn trước", description: "Nội dung tham khảo được giữ lại cho nhóm.", status: "ARCHIVED", listsCount: 2 },
  ];
  api.project.boardsCount = boards.length;
  await page.route(/\/projects\/p1\/boards(?:\?|$)/, async (route) => {
    const headers = { "Access-Control-Allow-Origin": route.request().headers().origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const board = { ...api.board, id: "new-board", name: body.name, description: body.description, membersCount: 1, listsCount: 0 };
      boards.push(board); api.project.boardsCount = boards.length;
      return route.fulfill({ headers, json: { success: true, data: board } });
    }
    return route.fulfill({ headers, json: { success: true, data: boards, pagination: { currentPage: 1, totalPages: 1, totalItems: boards.length, itemsPerPage: 10 } } });
  });
  await page.goto("/projects/p1");
  await expect(page.getByRole("heading", { level: 1, name: api.project.name })).toBeVisible();
  await expect(page.getByText("Tổ chức kế hoạch, thiết kế và phát triển sản phẩm cùng nhóm.")).toBeVisible();
  await expect(page.getByLabel("Tổng quan dự án").locator("dd")).toHaveText(["4", "1"]);
  const area = page.getByRole("region", { name: "Bảng của dự án", exact: true });
  await expect(area.getByRole("link")).toHaveCount(4);
  await expect(area.getByRole("link", { name: "Tài liệu giai đoạn trước", exact: true })).toContainText("Đã lưu trữ");
  await expect(page.getByRole("button", { name: "Thành viên dự án" }).locator('[data-slot="avatar"]')).toHaveCount(1);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual({ x: 0, y: 0, width: info.project.use.viewport!.width, height: info.project.use.viewport!.height });
  await page.screenshot({ path: info.outputPath("project-detail.jpg") });
  if (info.project.use.viewport!.width < 640) {
    await page.locator("#dashboard-main").hover(); await page.mouse.wheel(0, 500);
    await expect.poll(() => page.locator("#dashboard-main").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
  await area.getByRole("button", { name: "Tạo bảng", exact: true }).click();
  await page.getByLabel("Tên bảng", { exact: true }).fill("Bảng mới của nhóm");
  await page.getByRole("button", { name: "Tạo bảng", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(area.getByRole("link", { name: "Bảng mới của nhóm", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tổng quan dự án").locator("dd")).toHaveText(["5", "1"]);
  await page.getByRole("button", { name: "Đổi tên dự án", exact: true }).click();
  await page.getByRole("textbox", { name: "Tên dự án", exact: true }).fill("Kế hoạch nhóm sản phẩm");
  await page.getByRole("textbox", { name: "Tên dự án", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Kế hoạch nhóm sản phẩm" })).toBeVisible();
  await page.getByRole("button", { name: "Tùy chọn dự án", exact: true }).click();
  await page.getByRole("menuitem", { name: "Lưu trữ dự án", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Kế hoạch nhóm sản phẩm");
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await area.getByRole("link", { name: api.board.name, exact: true }).click();
  await expect(page.locator("#board-card-c1")).toBeVisible();
});

test("project details handle empty boards, missing counts and a retry without losing navigation", async ({ page, api }, info) => {
  api.project.name = "Kế hoạch triển khai và phối hợp giữa các nhóm sản phẩm trong giai đoạn tiếp theo";
  Object.assign(api.project, { boardsCount: undefined });
  let failing = true;
  await page.route(/\/projects\/p1\/boards(?:\?|$)/, (route) => route.fulfill({
    status: failing ? 500 : 200,
    headers: { "Access-Control-Allow-Origin": route.request().headers().origin, "Access-Control-Allow-Credentials": "true" },
    json: failing ? { success: false, message: "Chưa tải được danh sách bảng." } : { success: true, data: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 10 } },
  }));
  await page.goto("/projects/p1");
  const area = page.getByRole("region", { name: "Bảng của dự án", exact: true });
  await expect(area.getByRole("alert")).toContainText("Chưa tải được danh sách bảng.");
  await expect(page.getByLabel("Tổng quan dự án").locator("dd")).toHaveText(["—", "1"]);
  failing = false;
  await area.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(area.getByRole("heading", { name: "Dự án chưa có bảng" })).toBeVisible();
  await expect(area.getByRole("button", { name: "Tạo bảng", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(info.project.use.viewport!.width);
  await page.screenshot({ path: info.outputPath("project-empty.jpg") });
});
