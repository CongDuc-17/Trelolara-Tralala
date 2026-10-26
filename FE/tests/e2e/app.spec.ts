import { test, expect } from "./fixture";

test("task row controls stay centered with wrapped titles and multiple members", async ({ page, api }, info) => {
  await page.route("http://api.e2e.test/cards/c1", async (route) => {
    if (route.request().method() === "PATCH") await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fallback();
  });
  api.cards[0].title = "Đối chiếu kế hoạch phát hành và cập nhật công việc cùng các thành viên";
  api.cards[0].cardLabels = [{ id: "assignment-label", label: { id: "review", name: "Cần duyệt nội dung phát hành", color: "#ef4444" } }];
  api.cards[0].cardMembers.push({ id: "second-assignment", userId: "00000000-0000-4000-8000-000000000102", user: { ...api.user, id: "00000000-0000-4000-8000-000000000102", name: "Phạm Minh Hằng" } });
  await page.goto("/my-work");
  const row = page.locator("li").filter({ has: page.locator("#task-link-c1") });
  const complete = row.getByRole("button", { name: new RegExp(api.cards[0].title) });
  await expect(complete).toBeVisible();
  const search = (await page.getByRole("searchbox").boundingBox())!;
  const searchIcon = (await page.locator(".task-filters svg.lucide-search").boundingBox())!;
  expect(Math.abs(searchIcon.y + searchIcon.height / 2 - search.y - search.height / 2)).toBeLessThanOrEqual(1);
  for (const checked of [false, true]) {
    if (checked) await complete.click();
    await expect(complete).toHaveAttribute("aria-pressed", String(checked));
    if (checked) {
      await expect(complete).toBeEnabled();
      await expect(complete).toBeFocused();
    }
    const bounds = (await row.boundingBox())!;
    const button = (await complete.boundingBox())!;
    expect(Math.abs(button.y + button.height / 2 - bounds.y - bounds.height / 2)).toBeLessThanOrEqual(1);
    const navigationArrow = row.locator("a > svg.lucide-chevron-right");
    if (await navigationArrow.count()) {
      const arrow = (await navigationArrow.boundingBox())!;
      expect(Math.abs(arrow.y + arrow.height / 2 - button.y - button.height / 2)).toBeLessThanOrEqual(1);
    }
    const mark = (await complete.locator(checked ? "svg" : "span").boundingBox())!;
    expect(Math.abs(mark.x + mark.width / 2 - button.x - button.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(mark.y + mark.height / 2 - button.y - button.height / 2)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: info.outputPath("task-alignment.jpg") });
});

test("member dialog controls have consistent heights and aligned role columns", async ({ page, api }, info) => {
  const members = [
    { userId: api.user.id, boardId: "board", name: "Nguyễn Minh Anh", email: "minhanh@example.test", avatar: null, roleId: "admin", roleName: "BOARD_ADMIN" },
    { userId: "00000000-0000-4000-8000-000000000102", boardId: "board", name: "Phạm Minh Hằng — Nhóm nghiên cứu sản phẩm", email: "minh.hang.research.team@example.test", avatar: null, roleId: "viewer", roleName: "BOARD_VIEWER" },
  ];
  const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,OPTIONS" };
  await page.route(/\/boards\/board\/members(?:\?|$)/, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { success: true, data: members } }));
  await page.route(/\/roles(?:\?|$)/, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { success: true, data: [{ id: "admin", name: "BOARD_ADMIN", status: "ACTIVE" }, { id: "viewer", name: "BOARD_VIEWER", status: "ACTIVE" }] } }));
  await page.goto("/boards/board");
  await expect(page.locator(".board-header")).toBeVisible();
  for (const control of await page.locator(".board-header .ui-button").all()) {
    expect((await control.boundingBox())!.height).toBe(44);
  }
  await page.getByRole("button", { name: "Thành viên bảng", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const footer = dialog.locator('[data-slot="dialog-footer"]');
  const controls = await footer.locator("button").all();
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (const box of boxes) expect(Math.abs(box!.height - boxes[0]!.height)).toBeLessThanOrEqual(1);
  if (info.project.use.viewport!.width >= 640) {
    for (const box of boxes) expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
  } else {
    for (const box of boxes) expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
  }
  await expect(dialog.locator(".member-row")).toHaveCount(2);
  const roles = await dialog.getByRole("combobox", { name: /Vai trò của/ }).all();
  const roleBoxes = await Promise.all(roles.map((role) => role.boundingBox()));
  expect(Math.abs(roleBoxes[0]!.x - roleBoxes[1]!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(roleBoxes[0]!.width - roleBoxes[1]!.width)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("member-alignment.jpg") });
});

test.beforeEach(async ({ api }) => { expect(api.authenticated).toBe(true); });

test("login keeps failed drafts, defers private chunks and returns to the requested card", async ({ page, api }) => {
  api.authenticated = false;
  const modules: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".js")) modules.push(request.url()); });
  await page.goto("/boards/board/cards/c1");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(modules.some((url) => /\/(Board|CardDialogBody)-/.test(url))).toBe(false);
  await page.getByLabel("Email", { exact: true }).fill("an@example.test");
  await page.locator("#password").fill("fixture-password");
  api.failure = { path: "/auth/login", status: 401, message: "Email hoặc mật khẩu không đúng." };
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Email hoặc mật khẩu không đúng");
  await expect(page.locator("#password")).toHaveValue("fixture-password");
  await page.locator("#password").press("Enter");
  await expect(page.locator("#card-title")).toBeVisible();
  await expect(page).toHaveURL(/\/boards\/board\/cards\/c1$/);
  expect(modules.some((url) => /\/CardDialogBody-/.test(url))).toBe(true);
});

test("card errors retain drafts across language/theme changes and closing restores focus", async ({ page, api }) => {
  await page.goto("/boards/board");
  await page.locator("#board-card-c1").click();
  await expect(page.locator("#card-title")).toBeVisible();
  await page.locator("#card-title").fill("Bản nháp của An");
  api.failure = { path: "/cards/c1", status: 409, message: "Xung đột khi lưu thẻ." };
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Xung đột khi lưu thẻ");
  await expect(page.locator("#card-title")).toHaveValue("Bản nháp của An");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tùy chọn hiển thị" }).click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await dialog.getByRole("button", { name: "Display preferences" }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("#card-title")).toHaveValue("Bản nháp của An");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => api.cards[0].title).toBe("Bản nháp của An");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/boards\/board$/);
  await expect(page.locator("#board-card-c1")).toBeFocused();
});

test("deadline/reminder saves UTC while My work keeps its return filters", async ({ page, api }) => {
  await page.goto("/my-work?isComplete=false");
  await page.locator("#task-link-c1").click();
  await page.locator("#card-due-date").fill("2026-11-10T17:30");
  await page.getByRole("combobox", { name: "Nhắc trong ứng dụng" }).click();
  await page.getByRole("option", { name: "Trước 1 giờ", exact: true }).click();
  await page.getByRole("button", { name: "Lưu hạn và nhắc việc", exact: true }).click();
  await expect.poll(() => api.cards[0].dueDate).toBe("2026-11-10T10:30:00.000Z");
  expect(api.cards[0].reminderMinutesBefore).toBe(60);
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page).toHaveURL(/\/my-work\?isComplete=false$/);
  await expect(page.locator("#task-link-c1")).toBeFocused();
});

test("notifications paginate/filter at the server and invitations open their confirmation", async ({ page, api }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Thông báo, 12 chưa đọc" }).click();
  const popup = page.locator('[data-slot="popover-content"]');
  await expect(popup.locator("li")).toHaveCount(10);
  await popup.getByRole("button", { name: "Tải thêm thông báo" }).click();
  await expect(popup.locator("li")).toHaveCount(12);
  await popup.getByRole("switch").click();
  await expect(popup.locator("li")).toHaveCount(1);
  expect(api.calls.some((call) => call.path === "/notifications" && call.search.includes("isRead=true") && call.search.includes("page=1"))).toBe(true);
  await popup.getByRole("switch").click();
  await expect(popup.locator("li")).toHaveCount(12);
  await popup.locator('a[href="/invite/projects/fixture-token"]').click();
  await expect(page).toHaveURL(/\/invite\/projects\/fixture-token$/);
  await expect(page.getByRole("button", { name: "Chấp nhận", exact: true })).toBeVisible();
  await expect.poll(() => api.notifications[1].isRead).toBe(true);
});

test("personal notifications reload missed data after a socket disconnect", async ({ page, api }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Thông báo, 12 chưa đọc" })).toBeVisible();
  api.notifications.unshift({ ...api.notifications[0], id: "missed", content: "Thông báo nhận trong lúc mất kết nối" });
  await page.evaluate(() => window.dispatchEvent(new Event("qa:disconnect")));
  await expect(page.getByRole("button", { name: "Thông báo, 13 chưa đọc" })).toBeVisible();
  await page.getByRole("button", { name: "Thông báo, 13 chưa đọc" }).click();
  await expect(page.getByText("Thông báo nhận trong lúc mất kết nối", { exact: true })).toBeVisible();
});

test("a delayed card module keeps the board mounted and its loading dialog can close", async ({ page }, info) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/assets/CardDialogBody-*.js", async (route) => { await held; await route.continue(); });
  await page.goto("/boards/board");
  const opener = await page.locator("#board-card-c1").elementHandle();
  await page.locator("#board-card-c1").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status", { name: "Đang tải màn hình…" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("card-module-pending.jpg") });
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  expect(await opener?.evaluate((node) => node.isConnected)).toBe(true);
  release();
  await page.locator("#board-card-c1").click();
  await expect(page.locator("#card-title")).toBeVisible();
});

test("a failed route module offers recovery while the workspace navigation survives", async ({ page }) => {
  await page.route("**/assets/Board-*.js", (route) => route.abort());
  await page.goto("/boards/board");
  await expect(page.getByRole("alert")).toHaveText("Không tải được màn hình.");
  await expect(page.getByRole("button", { name: "Tải lại ứng dụng" })).toBeVisible();
  await page.getByRole("link", { name: "Về Tổng quan" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan công việc" })).toBeVisible();
});

test("keyboard and pointer drag preserve confirmed ordering", async ({ page, api }, info) => {
  await page.goto("/boards/board");
  const card = page.locator("#board-card-c1");
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.locator('[data-board-dragging="true"]')).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.press("Space");
  await expect.poll(() => [...api.cards].filter((item) => item.listId === "l1").sort((a, b) => a.position - b.position)[0].id).toBe("c2");
  if ((info.project.use.viewport?.width ?? 0) < 1024) return;
  await expect(page.locator('[data-list-id="l1"] [id^="board-card-"]').first()).toHaveAttribute("id", "board-card-c2");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const from = await card.boundingBox();
  const to = await page.locator("#board-card-c3").boundingBox();
  expect(from && to).toBeTruthy();
  if (!from || !to) throw new Error("Missing drag target");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => api.cards[0].listId).toBe("l2");
});

test("card hover completion, colored labels and aligned task dates work without opening details", async ({ page, api }, info) => {
  await page.route("http://api.e2e.test/cards/c1", async (route) => {
    if (route.request().method() === "PATCH") await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fallback();
  });
  api.cards[0].dueDate = "2026-11-10T12:27:00.000Z";
  api.cards[0].cardLabels = [{ id: "cl1", label: { id: "label1", name: "Cần duyệt", color: "#ef4444" } }];
  await page.goto("/boards/board");
  const card = page.locator('[data-card-id="c1"]');
  const complete = card.getByRole("checkbox");
  await expect(complete).toHaveAttribute("data-state", "unchecked");
  await expect(card.locator("svg.lucide-calendar-clock")).toHaveCount(0);
  await expect(card.locator('[data-slot="badge"]')).toHaveCSS("background-color", "rgb(239, 68, 68)");
  const touch = info.project.use.hasTouch ?? false;
  if (!touch) {
    await expect(complete).toHaveCSS("opacity", "0");
    await card.hover();
  }
  await expect(complete).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath("board-hover.jpg") });
  await complete.click();
  await expect(complete).toHaveAttribute("data-state", "checked");
  await expect(page).toHaveURL(/\/boards\/board$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => api.cards[0].isComplete).toBe(true);
  await page.mouse.move(0, 0);
  await expect(complete).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath("board-complete.jpg") });
  await expect(complete).toBeEnabled();
  await complete.focus(); await page.keyboard.press("Space");
  await expect(complete).toHaveAttribute("data-state", "unchecked");
  api.failure = { path: "/cards/c1", status: 409, message: "Không thể cập nhật thẻ." };
  await expect(complete).toBeEnabled();
  await expect(complete).toBeFocused();
  if (!touch) await card.hover();
  await complete.click();
  await expect(card.getByRole("alert")).toContainText("Không thể cập nhật thẻ");
  await expect(complete).toHaveAttribute("data-state", "unchecked");
  const labelBox = (await card.locator('[data-slot="badge"]').boundingBox())!;
  await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await expect(page.locator("#card-title")).toBeVisible();
  await expect(page.getByRole("dialog").locator("svg.lucide-calendar-clock")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Tùy chọn hiển thị" }).click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const phone = info.project.use.viewport!.width < 768;
  if (phone) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await expect(page.locator("#task-link-c1")).toBeVisible();
  for (const language of ["en", "vi"]) {
    const row = page.locator("li").filter({ has: page.locator("#task-link-c1") });
    await expect(row.locator('[data-slot="badge"]')).toHaveCSS("background-color", "rgb(239, 68, 68)");
    const icon = row.locator("svg.lucide-calendar-clock:visible");
    const text = icon.locator("..").locator("span");
    const iconBox = (await icon.boundingBox())!;
    const textBox = (await text.boundingBox())!;
    expect(Math.abs(iconBox.y + iconBox.height / 2 - textBox.y - textBox.height / 2)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("my-work-" + language + ".jpg") });
    if (language === "en") {
      if (phone) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      await page.getByRole("group", { name: "Language", exact: true }).getByRole("radio", { name: "Tiếng Việt", exact: true }).click();
      if (phone) await page.keyboard.press("Escape");
    }
  }
});

test("core screens fit the viewport and retain semantic controls", async ({ page }, info) => {
  for (const [name, path, ready] of [
    ["dashboard", "/dashboard", "h1"], ["projects", "/projects", 'a[href="/projects/p1"]'], ["project", "/projects/p1", "h1"], ["board", "/boards/board", "#board-card-c1"], ["search", "/boards/board/search", "#task-link-c1"],
    ["card", "/boards/board/cards/c1", "#card-title"], ["my-work", "/my-work", "#task-link-c1"],
    ["archive", "/archived", '[role="tablist"]'], ["profile", "/me", "#profile-name"], ["login", "/login", "#password"],
  ]) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator("button button, a button, button a").count()).toBe(0);
    expect(await page.locator("body").evaluate((node) => getComputedStyle(node).fontSize)).toBe("14px");
    const compactTitle = name === "board" || name === "card" || (info.project.use.viewport!.width < 640 && name !== "login");
    expect(await page.locator("h1").first().evaluate((node) => getComputedStyle(node).fontSize)).toBe(compactTitle ? "22px" : "26px");
    await page.screenshot({ path: info.outputPath(name + ".jpg") });
  }
});

test("member avatars load before opening and navigation stays an icon rail", async ({ page }, info) => {
  await page.goto("/boards/board");
  const members = page.getByRole("button", { name: "Thành viên bảng", exact: true });
  await expect(members.locator('[data-slot="avatar"]')).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const memberBox = (await members.boundingBox())!, menuBox = (await page.getByRole("button", { name: "Tùy chọn bảng", exact: true }).boundingBox())!;
  expect(Math.abs(memberBox.y + memberBox.height / 2 - menuBox.y - menuBox.height / 2)).toBeLessThan(1);
  await expect(page.locator("#workspace-sidebar-toggle")).toHaveCount(0);
  if (info.project.use.viewport!.width >= 768) await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link")).toHaveCount(5);
  await members.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Vai trò của/ })).toContainText("Quản trị viên");
  await page.screenshot({ path: info.outputPath("members.jpg") });
  await page.getByRole("button", { name: "Đóng", exact: true }).last().click();
  await expect(members).toBeFocused();
});

test("the shadcn calendar marks assigned due dates and opens the selected day's task", async ({ page, api }, info) => {
  const dates = await page.evaluate(() => {
    const date = new Date(); date.setHours(16, 0, 0, 0);
    const next = new Date(date); next.setDate(date.getDate() + 1);
    return { today: date.toISOString(), next: next.toISOString(), todayKey: date.toLocaleDateString("en-CA"), nextKey: next.toLocaleDateString("en-CA") };
  });
  api.cards[0].dueDate = dates.today;
  api.cards[1].dueDate = dates.next;
  api.cards[2].dueDate = dates.today;
  api.cards[2].isComplete = true;
  await page.goto("/boards/board");
  if (info.project.use.viewport!.width < 1280) await page.locator("#dashboard-context-toggle").click();
  const panel = page.locator("#dashboard-context");
  await expect(panel.getByRole("heading", { name: "Lịch công việc" })).toBeVisible();
  const today = panel.locator(`button[data-day="${dates.todayKey}"]`);
  await expect(today).toHaveAttribute("aria-label", /1 công việc đến hạn/);
  expect(await panel.locator(".dashboard-context-content").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const geometry = await panel.locator(".workspace-calendar").evaluate((node) => {
    const calendar = node.getBoundingClientRect();
    return { left: calendar.left, right: calendar.right, controls: Array.from(node.querySelectorAll("button"), (button) => { const box = button.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; }) };
  });
  expect(geometry.controls.length).toBeGreaterThan(28);
  for (const box of geometry.controls) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(geometry.left - 1);
    expect(box.right).toBeLessThanOrEqual(geometry.right + 1);
  }
  await expect(panel.getByRole("link", { name: new RegExp(api.cards[0].title) })).toBeVisible();
  await expect(page.locator("#board-card-c1")).toBeVisible();
  await page.screenshot({ path: info.outputPath("schedule.jpg") });
  await today.focus();
  await today.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("link", { name: new RegExp(api.cards[1].title) })).toBeVisible();
  await panel.getByRole("link", { name: new RegExp(api.cards[1].title) }).click();
  await expect(page.locator("#card-title")).toHaveValue(api.cards[1].title);
  await expect(page).toHaveURL(/\/my-work\/boards\/board\/cards\/c2$/);
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await expect(panel.getByRole("button", { name: /Tài khoản/ })).toHaveCount(0);
  await expect(panel.getByText("Bảng ngoài dự án", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Đóng lịch công việc" }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator("#dashboard-context-toggle")).toBeFocused();
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })) ).toEqual({ x: 0, y: 0, width: info.project.use.viewport!.width, height: info.project.use.viewport!.height });
});

test("projects use grouped cards and the account identity stays at the top of the right panel", async ({ page, api }, info) => {
  const projects = [
    { ...api.project, description: "Tổ chức kế hoạch và phát triển sản phẩm cùng nhóm." },
    { ...api.project, id: "p2", name: "Nghiên cứu và trải nghiệm người dùng", description: "Kết quả nghiên cứu và các luồng thiết kế.", boardsCount: 0 },
    { ...api.project, id: "p3", name: "Phối hợp phát hành", roleName: "PROJECT_MEMBER", description: "Các bước chuẩn bị trước khi đưa sản phẩm đến người dùng." },
    { ...api.project, id: "old", name: "Dự án giai đoạn trước", status: "ARCHIVED" },
  ];
  await page.route(/^http:\/\/api\.e2e\.test\/projects(?:\?|$)/, async (route) => {
    const headers = { "Access-Control-Allow-Origin": route.request().headers().origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const created = { ...api.project, id: "new-project", name: body.name, description: body.description, boardsCount: 0, membersCount: 1 };
      projects.push(created);
      return route.fulfill({ headers, json: { success: true, data: created } });
    }
    return route.fulfill({ headers, json: { success: true, data: projects, pagination: { currentPage: 1, totalPages: 1, totalItems: projects.length, itemsPerPage: 10 } } });
  });
  await page.goto("/projects");
  const managed = page.getByRole("region", { name: "Dự án quản trị", exact: true });
  const joined = page.getByRole("region", { name: "Dự án tham gia", exact: true });
  await expect(managed.getByRole("link")).toHaveCount(2);
  await expect(joined.getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Dự án giai đoạn trước", exact: true })).toHaveCount(0);
  await expect(page.locator(".dashboard-heading").getByRole("button", { name: /Tài khoản/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("projects.jpg") });
  if (info.project.use.viewport!.width < 1280) await page.locator("#dashboard-context-toggle").click();
  const panel = page.locator("#dashboard-context");
  const identity = panel.getByRole("group", { name: `Tài khoản ${api.user.name}`, exact: true });
  await expect(identity).toBeVisible();
  await expect(identity.getByText(api.user.email, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Tài khoản|Đăng xuất/ })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Hồ sơ cá nhân", exact: true })).toHaveCount(0);
  expect((await identity.boundingBox())!.y).toBeLessThan((await panel.locator('[data-slot="calendar"]').boundingBox())!.y);
  await page.screenshot({ path: info.outputPath("account-panel.jpg") });
  if (info.project.use.viewport!.width < 1280) await page.locator("#dashboard-context-close").click();
  await page.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  const footerButtons = await page.getByRole("dialog").locator('[data-slot="dialog-footer"] button').all();
  for (const button of footerButtons) expect((await button.boundingBox())!.height).toBe(44);
  await page.getByLabel("Tên dự án", { exact: true }).fill("Dự án mới của nhóm");
  await page.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(managed.getByRole("link", { name: "Dự án mới của nhóm", exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, y: scrollY }))).toEqual({ width: info.project.use.viewport!.width, height: info.project.use.viewport!.height, y: 0 });
  await managed.getByRole("link", { name: api.project.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: api.project.name })).toBeVisible();
});

test("sidebar logout confirms, cancels without a request and retains the session on failure", async ({ page, api }, info) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { level: 1, name: "Dự án", exact: true })).toBeVisible();
  if (info.project.use.viewport!.width < 768) await page.getByRole("button", { name: "Mở điều hướng", exact: true }).click();
  const trigger = page.locator("#sidebar-logout");
  await expect(trigger).toBeVisible();
  const footer = page.locator('[data-slot="sidebar-footer"]');
  expect((await trigger.boundingBox())!.y).toBeGreaterThan((await footer.getByRole("group", { name: "Giao diện", exact: true }).boundingBox())!.y);
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  expect(api.calls.filter((call) => call.path === "/auth/logout")).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("logout-confirm.jpg") });
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(api.authenticated).toBe(true);
  expect(api.calls.filter((call) => call.path === "/auth/logout")).toHaveLength(0);
  await trigger.click();
  api.failure = { path: "/auth/logout", status: 500, message: "Không thể đăng xuất lúc này." };
  await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Không thể đăng xuất lúc này.");
  expect(api.authenticated).toBe(true);
  await expect(page).toHaveURL(/\/projects$/);
  await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(api.authenticated).toBe(false);
  expect(api.calls.filter((call) => call.path === "/auth/logout")).toHaveLength(2);
});

test("compact sidebar switches persist and archives open in the center", async ({ page }, info) => {
  await page.goto("/dashboard");
  const phone = info.project.use.viewport!.width < 768;
  if (phone) await page.getByRole("button", { name: "Mở điều hướng", exact: true }).click();
  {
    const rail = phone ? page.locator('[data-mobile="true"][data-slot="sidebar"]') : page.locator('[data-slot="sidebar-inner"]');
    const railBox = (await rail.boundingBox())!;
    for (const button of await rail.locator('nav [data-slot="sidebar-menu-button"], [data-slot="sidebar-footer"] button:visible').all()) {
      const box = (await button.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - railBox.x - railBox.width / 2)).toBeLessThan(1);
      const icon = button.locator("svg");
      if (await icon.count()) {
        const iconBox = (await icon.boundingBox())!;
        expect(Math.abs(iconBox.x + iconBox.width / 2 - box.x - box.width / 2)).toBeLessThan(1);
      }
    }
    for (const button of await rail.getByRole("group").getByRole("radio").all()) {
      const box = (await button.boundingBox())!;
      const switchSize = info.project.use.viewport!.width < 640 ? 44 : 36;
      expect(box.width).toBe(switchSize);
      expect(box.height).toBe(switchSize);
    }
    for (const group of await rail.getByRole("group").all()) {
      const selected = group.getByRole("radio", { checked: true });
      const unselected = group.getByRole("radio", { checked: false }).first();
      expect(await selected.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(await unselected.evaluate((node) => getComputedStyle(node).backgroundColor));
    }
    if (phone) expect(railBox.width).toBeLessThan(100);
    await expect(rail.getByText("Kế hoạch sản phẩm", { exact: true })).toHaveCount(0);
  }
  await page.getByRole("group", { name: "Ngôn ngữ", exact: true }).getByRole("radio", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const theme = info.project.use.colorScheme === "dark" ? "light" : "dark";
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("radio", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  expect(await page.evaluate(() => ({ language: localStorage.getItem("trelolara-language"), theme: localStorage.getItem("trelolara-theme") }))).toEqual({ language: "en", theme });
  await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("radio", { name: info.project.use.colorScheme === "dark" ? "Dark" : "Light", exact: true }).click();
  await page.getByRole("group", { name: "Language", exact: true }).getByRole("radio", { name: "Tiếng Việt", exact: true }).click();
  await page.screenshot({ path: info.outputPath("sidebar-switches.jpg") });
  await page.getByRole("link", { name: "Mục đã lưu trữ", exact: true }).click();
  const center = page.locator("#dashboard-main");
  await expect(center.getByRole("heading", { name: "Mục đã lưu trữ", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/archived$/);
  await expect(center.getByText("Chưa có dự án đã lưu trữ.", { exact: true })).toBeVisible();
  await center.getByRole("tab", { name: /Bảng/ }).click();
  await expect(center.getByText("Chưa có bảng đã lưu trữ.", { exact: true })).toBeVisible();
  await expect(page.locator("#dashboard-context").getByText("Mục đã lưu trữ", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("archive-panel.jpg") });
  if (info.project.use.viewport!.width < 1280) await page.locator("#dashboard-context-toggle").click();
  await expect(page.locator('#dashboard-context [data-slot="calendar"]')).toBeVisible();
  await page.locator("#dashboard-context-close").focus();
  await expect(page.locator("#dashboard-context-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dashboard-context")).toBeHidden();
  await expect(page.locator("#dashboard-context-toggle")).toBeFocused();
  await page.setViewportSize({ ...info.project.use.viewport!, height: 390 });
  if (phone) await page.getByRole("button", { name: "Mở điều hướng", exact: true }).click();
  const shortRail = phone ? page.locator('[data-mobile="true"][data-slot="sidebar"]') : page.locator('[data-slot="sidebar-inner"]');
  expect((await shortRail.locator('[data-slot="sidebar-content"]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const preferences = shortRail.getByRole("button", { name: "Tùy chọn hiển thị", exact: true });
  await preferences.click();
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preferences).toBeFocused();
});

test("board backgrounds cover the compact and detailed board tiles", async ({ page, api }, info) => {
  const background = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect width='800' height='400' fill='%235e918d'/%3E%3Cpath d='M0 400L400 0H800L400 400Z' fill='%23bad5cd'/%3E%3C/svg%3E";
  Object.assign(api.board, { background });
  for (const [name, route] of [["compact", "/dashboard"], ["detailed", "/projects/p1"]]) {
    await page.goto(route);
    const tile = page.locator("#dashboard-main").getByRole("link", { name: api.board.name, exact: true });
    await expect(tile).toBeVisible();
    await expect.poll(() => tile.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("data:image/svg+xml");
    expect(await tile.evaluate((node) => getComputedStyle(node).backgroundSize)).toBe("cover");
    await expect(tile.locator('[style*="background-image"]')).toHaveCount(0);
    await expect(tile).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.screenshot({ path: info.outputPath("board-background-" + name + ".jpg") });
  }
});

test("My work summary follows filters and completing a task preserves card navigation", async ({ page, api }, info) => {
  api.cards[0].dueDate = new Date(Date.now() - 86_400_000).toISOString();
  api.cards[0].isOverdue = true;
  api.cards[2].isComplete = true;
  await page.goto("/my-work");
  const summary = page.getByRole("region", { name: "Tổng quan công việc đã tải" });
  const counts = () => summary.locator("dd").allTextContents();
  await expect.poll(counts).toEqual(["3", "2", "1", "1"]);
  await expect(page.locator("#task-link-c1")).toBeVisible();
  if (info.project.use.viewport!.width < 640) expect((await page.locator("#task-link-c1").boundingBox())!.y).toBeLessThan(info.project.use.viewport!.height * 0.6);
  const dueFilters = page.getByRole("group", { name: "Lọc theo hạn", exact: true });
  const filterBox = (await dueFilters.boundingBox())!;
  const lastFilter = (await dueFilters.getByRole("radio", { name: "Chưa có hạn", exact: true }).boundingBox())!;
  expect(lastFilter.x + lastFilter.width).toBeLessThanOrEqual(filterBox.x + filterBox.width + 1);
  await page.screenshot({ path: info.outputPath("my-work.jpg") });
  const phone = info.project.use.viewport!.width < 640;
  if (phone) await page.getByRole("button", { name: "Bộ lọc", exact: true }).click();
  await page.getByRole("combobox", { name: "Trạng thái hoàn thành", exact: true }).click();
  await page.getByRole("option", { name: "Chưa hoàn thành", exact: true }).click();
  if (phone) await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/my-work\?isComplete=false$/);
  await expect.poll(counts).toEqual(["2", "2", "0", "1"]);
  await page.locator("#task-link-c1").click();
  await expect(page.locator("#card-title")).toBeVisible();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page).toHaveURL(/\/my-work\?isComplete=false$/);
  await expect(page.locator("#task-link-c1")).toBeFocused();
  await page.getByRole("button", { name: "Hoàn thành " + api.cards[0].title, exact: true }).click();
  await expect(page.locator("#task-link-c1")).toHaveCount(0);
  await expect.poll(counts).toEqual(["1", "1", "0", "0"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("archive page shows real project and board counts and confirms deletion", async ({ page, api }, info) => {
  api.project.status = "ARCHIVED";
  api.board.status = "ARCHIVED";
  await page.goto("/archived");
  const main = page.locator("#dashboard-main");
  await expect(main.getByRole("heading", { name: api.project.name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tổng quan lưu trữ" }).locator("dd")).toHaveText(["1", "1"]);
  await expect(main.getByRole("button", { name: "Khôi phục dự án " + api.project.name, exact: true })).toBeVisible();
  await page.reload();
  await expect(main.getByRole("heading", { name: api.project.name, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("archive-projects.jpg") });
  await main.getByRole("button", { name: "Xóa dự án " + api.project.name, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
  await main.getByRole("tab", { name: "Bảng", exact: true }).click();
  await expect(main.getByRole("button", { name: "Khôi phục bảng " + api.board.name, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("archive-boards.jpg") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("profile editing stays in Personal and cancel restores its trigger and saved values", async ({ page, api }, info) => {
  await page.goto("/me");
  const main = page.locator("#dashboard-main");
  await expect(main.locator("#profile-email")).toHaveAttribute("readonly", "");
  await main.getByRole("tab", { name: "Bảo mật", exact: true }).click();
  await expect(main.getByRole("button", { name: "Sửa hồ sơ", exact: true })).toHaveCount(0);
  await main.getByRole("tab", { name: "Hiển thị", exact: true }).click();
  await expect(main.getByRole("button", { name: "Sửa hồ sơ", exact: true })).toHaveCount(0);
  await main.getByRole("tab", { name: "Cá nhân", exact: true }).click();
  await main.getByRole("button", { name: "Sửa hồ sơ", exact: true }).click();
  await expect(main.locator("#profile-name")).toBeFocused();
  await main.locator("#profile-name").fill("Tên đang chỉnh sửa");
  await main.getByRole("tab", { name: "Bảo mật", exact: true }).click();
  await main.getByRole("tab", { name: "Cá nhân", exact: true }).click();
  await expect(main.locator("#profile-name")).toHaveValue("Tên đang chỉnh sửa");
  await page.screenshot({ path: info.outputPath("profile-edit.jpg") });
  await main.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(main.getByRole("button", { name: "Sửa hồ sơ", exact: true })).toBeFocused();
  await expect(main.locator("#profile-name")).toHaveValue(api.user.name);
  expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
});
