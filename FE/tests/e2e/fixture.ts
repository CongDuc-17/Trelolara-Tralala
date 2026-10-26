import { test as base, expect, type Page } from "@playwright/test";

const apiOrigin = "http://api.e2e.test";
const date = "2026-10-23T03:00:00.000Z";

export function createFixture() {
  const user = { id: "00000000-0000-4000-8000-000000000101", name: "Nguyễn An", email: "an@example.test", avatar: null, address: "Thành phố Hồ Chí Minh", bio: "Điều phối sản phẩm cùng nhóm.", createdAt: date };
  const project = { id: "p1", name: "Kế hoạch sản phẩm", status: "ACTIVE", roleName: "PROJECT_ADMIN", boardsCount: 1, membersCount: 1 };
  const board = { id: "board", projectId: project.id, name: "Phát triển sản phẩm", status: "ACTIVE", roleName: "PROJECT_ADMIN", membersCount: 1, listsCount: 3 };
  const lists = ["Cần thực hiện", "Đang thực hiện", "Hoàn tất"].map((name, index) => ({ id: "l" + (index + 1), boardId: board.id, name, position: (index + 1) * 1000, status: "ACTIVE" }));
  const cards = ["Đối chiếu kế hoạch cùng nhóm", "Hoàn thiện hướng dẫn", "Kiểm tra bản phát hành"].map((title, index) => ({
    id: "c" + (index + 1), title, listId: index === 2 ? "l2" : "l1", description: "Giữ bản nháp khi có lỗi.", position: (index + 1) * 1000, status: "ACTIVE",
    dueDate: null as string | null, isComplete: false, isOverdue: false, reminderMinutesBefore: null as number | null, createdAt: date,
    cardMembers: [{ id: "assignment-" + index, userId: user.id, user }], cardLabels: [] as { id: string; label: { id: string; name: string; color: string } }[], checklists: [], _count: { comments: 0 },
  }));
  const notifications = Array.from({ length: 13 }, (_, index) => ({ id: "n" + index, type: index === 1 ? "PROJECT_INVITED" : "CARD_ASSIGNED", title: "Cập nhật công việc", content: index === 1 ? "Minh Anh mời bạn tham gia dự án." : "Thẻ cần xem " + (index + 1), entityType: index === 1 ? "PROJECT" : "CARD", entityId: index === 1 ? project.id : "c1", metadata: index === 1 ? { token: "fixture-token" } : { boardId: board.id }, isRead: index === 12, createdAt: date }));
  return { user, project, board, lists, cards, notifications, authenticated: true, denied: false, failure: null as null | { path: string; status: number; message: string }, calls: [] as { method: string; path: string; search: string; body: Record<string, unknown> }[], unexpected: [] as string[], errors: [] as string[] };
}

const sorted = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

export async function installFixture(page: Page, state: ReturnType<typeof createFixture>, theme: "light" | "dark") {
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.addInitScript(({ theme }) => {
    localStorage.setItem("trelolara-language", "vi");
    localStorage.setItem("trelolara-theme", theme);
    const sockets = new Set<FixtureSocket>();
    class FixtureSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor() { sockets.add(this); setTimeout(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.(new Event("open")); } }, 0); }
      send(value: string) {
        const message = JSON.parse(value);
        if (message.event === "board:subscribe") setTimeout(() => this.emit({ event: "board:subscribed", data: { boardId: message.data.boardId, revision: "1" } }), 0);
      }
      emit(value: unknown) { if (this.readyState === 1) this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) })); }
      close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; sockets.delete(this); setTimeout(() => this.onclose?.(new CloseEvent("close", { code })), 0); }
    }
    Object.defineProperty(window, "WebSocket", { configurable: true, value: FixtureSocket });
    window.addEventListener("qa:socket", (event) => { for (const socket of sockets) socket.emit((event as CustomEvent).detail); });
    window.addEventListener("qa:disconnect", () => { for (const socket of [...sockets]) socket.close(1006); });
  }, { theme });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== apiOrigin) {
      if (url.origin === "http://127.0.0.1:4173") return route.continue();
      state.unexpected.push(request.method() + " " + url.origin + url.pathname);
      return route.abort();
    }
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const body = request.headers()["content-type"]?.includes("application/json") ? request.postDataJSON() as Record<string, unknown> : {};
    const method = request.method();
    const path = url.pathname;
    state.calls.push({ method, path, search: url.search, body });
    const send = (data: unknown) => route.fulfill({ headers, json: { success: true, data } });
    const fail = (status: number, message: string) => route.fulfill({ status, headers, json: { success: false, message } });
    const paged = (rows: unknown[]) => {
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 10);
      return route.fulfill({ headers, json: { success: true, data: rows.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { currentPage: pageNumber, itemsPerPage: limit, totalPages: Math.ceil(rows.length / limit), totalItems: rows.length } } });
    };
    if (state.failure?.path === path) { const failure = state.failure; state.failure = null; return fail(failure.status, failure.message); }
    if (path === "/auth/login") { state.authenticated = true; return send({}); }
    if (path === "/auth/logout") { state.authenticated = false; return send(null); }
    if (path === "/auth/refresh-token") return state.authenticated ? send({}) : fail(401, "Phiên đã hết hạn.");
    if (path === "/users/me") return state.authenticated ? send(state.user) : fail(401, "Cần đăng nhập.");
    if (!state.authenticated) return fail(401, "Cần đăng nhập.");
    if (path === "/projects") return paged([state.project]);
    if (path === "/projects/p1") { if (method === "PATCH") Object.assign(state.project, body); return send(state.project); }
    if (path === "/boards" || path === "/projects/p1/boards") return paged([state.board]);
    if (path === "/boards/board") return state.denied ? fail(403, "Quyền truy cập đã thay đổi.") : send(state.board);
    if (path === "/boards/board/lists") return send(sorted(state.lists.filter((item) => !url.searchParams.has("status") || item.status === url.searchParams.get("status"))));
    if (/^\/lists\/[^/]+\/cards$/.test(path)) return send(sorted(state.cards.filter((item) => item.listId === path.split("/")[2] && (!url.searchParams.has("status") || item.status === url.searchParams.get("status")))));
    if (path === "/boards/board/labels") return send([]);
    if (path === "/projects/p1/members") return paged([{ id: state.user.id, projectId: "p1", name: state.user.name, email: state.user.email, avatar: null, roleId: "admin", roleName: "PROJECT_ADMIN" }]);
    if (path === "/boards/board/members") return send([{ userId: state.user.id, boardId: "board", name: state.user.name, email: state.user.email, avatar: null, roleId: "admin", roleName: "BOARD_ADMIN" }]);
    if (path === "/roles") return send([{ id: "admin", name: "BOARD_ADMIN", status: "ACTIVE" }]);
    if (path === "/users/me/cards" || path === "/boards/board/cards") {
      const rows = state.cards.filter((card) => (!url.searchParams.has("isComplete") || card.isComplete === (url.searchParams.get("isComplete") === "true")) && (!url.searchParams.get("q") || card.title.includes(url.searchParams.get("q")!)));
      return send({ items: rows.map((card) => ({ ...card, list: { ...state.lists.find((list) => list.id === card.listId), board: { ...state.board, project: { status: "ACTIVE" } } } })), nextCursor: null });
    }
    if (/^\/cards\/[^/]+\/move$/.test(path)) {
      const card = state.cards.find((item) => item.id === path.split("/")[2]);
      if (!card) return fail(404, "Không tìm thấy thẻ.");
      const siblings = sorted(state.cards.filter((item) => item.id !== card.id && item.listId === body.targetListId));
      const after = siblings.findIndex((item) => item.id === body.afterCardId);
      const before = siblings.findIndex((item) => item.id === body.beforeCardId);
      siblings.splice(after >= 0 ? after : before >= 0 ? before + 1 : siblings.length, 0, card);
      siblings.forEach((item, index) => { item.position = (index + 1) * 1000; });
      card.listId = String(body.targetListId);
      return send(card);
    }
    if (/^\/cards\/[^/]+$/.test(path)) {
      const card = state.cards.find((item) => item.id === path.split("/")[2]);
      if (!card) return fail(404, "Không tìm thấy thẻ.");
      if (method === "PATCH") Object.assign(card, body);
      return send({ ...card, commentCount: card._count.comments, members: card.cardMembers.map((member) => ({ id: member.id, userId: member.userId, userName: member.user.name, userAvatar: member.user.avatar })), labels: card.cardLabels.map(({ label }) => label), comments: [], checklists: [] });
    }
    if (path === "/notifications") return paged(state.notifications.filter((item) => item.isRead === (url.searchParams.get("isRead") === "true")));
    if (path === "/notifications/unread-count") return send({ count: state.notifications.filter((item) => !item.isRead).length });
    if (/^\/notifications\/[^/]+\/read$/.test(path)) { const item = state.notifications.find((item) => item.id === path.split("/")[2]); if (item) item.isRead = true; return send(null); }
    if (/^\/invitations\//.test(path)) return send("Invitation accepted");
    state.unexpected.push(method + " " + path);
    return fail(404, "Endpoint absent from the isolated fixture.");
  });
}

export const test = base.extend<{ api: ReturnType<typeof createFixture> }>({
  api: async ({ page }, provide, info) => {
    const state = createFixture();
    await installFixture(page, state, info.project.use.colorScheme === "dark" ? "dark" : "light");
    await provide(state);
    expect(state.unexpected).toEqual([]);
    expect(state.errors).toEqual([]);
  },
});

export { expect };
