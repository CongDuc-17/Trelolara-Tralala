import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { type AxiosAdapter } from "axios";
import { createQueryClient } from "@/app/queryClient";
import { axiosClient, resetApiSession } from "@/lib/apiClient";
import { deferred, httpError, reply } from "../../../support/helpers";
import { Dashboard } from "@/pages/Dashboard";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { Archive } from "@/pages/Archive";
import { Projects } from "@/pages/Projects";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { ProjectBoardGrid } from "@/features/catalog/ProjectBoardGrid";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CreateProject } from "@/components/projects/CreateProject";
import { CreateBoard } from "@/components/boards/CreateBoard";
import { HeaderBoard } from "@/components/boards/HeaderBoard";
import { MembersDialog } from "@/features/catalog/MembersDialog";
import { pageItems, useBoard, useInvalidateCatalog, useProjects } from "@/features/catalog/queries";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import type { Board, Project, Role } from "@/features/catalog/types";
import i18n from "@/app/i18n";

const session = vi.hoisted(() => ({ user: { id: "alice", name: "Alice", email: "alice@example.test" } }));
vi.mock("@/features/auth/session-context", () => ({ useSession: () => session }));
vi.mock("@/components/Notifications", () => ({ Notifications: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() }, Toaster: () => null }));
const blocked = axiosClient.defaults.adapter;
let client = createQueryClient();
let projects: Project[];
let boards: Board[];
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;
const roles: Role[] = [
  { id: "admin", name: "PROJECT_ADMIN", status: "ACTIVE" },
  { id: "custom", name: "PROJECT_DESIGNER", status: "ACTIVE" },
  { id: "board-role", name: "BOARD_EDITOR", status: "ACTIVE" },
  { id: "inactive", name: "PROJECT_OLD", status: "INACTIVE" },
];

function paged<T>(rows: T[], page: number) {
  return { success: true, data: rows.slice((page - 1) * 10, page * 10), pagination: { currentPage: page, totalPages: Math.ceil(rows.length / 10), itemsPerPage: 10, totalItems: rows.length } };
}
function urls() { return adapter.mock.calls.map(([config]) => config.url); }

beforeEach(async () => {
  await i18n.changeLanguage("vi");
  resetApiSession();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  session.user = { id: "alice", name: "Alice", email: "alice@example.test" };
  projects = [{ id: "p1", name: "Dự án Một", status: "ACTIVE", roleName: "PROJECT_ADMIN" }];
  boards = [];
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  adapter = vi.fn<AxiosAdapter>(async (config) => {
    const page = Number(config.params?.page ?? 1);
    if (config.method !== "get") return reply(config, { success: true, data: {} });
    if (config.url?.startsWith("/users/me/cards?")) return reply(config, { success: true, data: { items: [], nextCursor: null } });
    if (config.url === "/projects") return reply(config, paged(projects, page));
    if (config.url === "/boards") return reply(config, paged(boards, page));
    if (config.url === "/roles") return reply(config, { success: true, data: roles });
    if (config.url?.match(/^\/projects\/[^/]+\/boards$/)) return reply(config, paged(boards.filter((board) => board.projectId === config.url?.split("/")[2]), page));
    if (config.url?.match(/^\/projects\/[^/]+\/members$/)) return reply(config, paged(Array.from({ length: 12 }, (_, index) => ({ id: `u${index}`, projectId: "p1", name: `Người ${index}`, email: `u${index}@example.test`, roleId: "admin", roleName: "PROJECT_ADMIN" })), page));
    if (config.url?.match(/^\/boards\/[^/]+\/members$/)) return reply(config, { success: true, data: Array.from({ length: 12 }, (_, index) => ({ boardId: "b1", userId: `b${index}`, name: `Bạn ${index}`, email: `b${index}@example.test`, roleId: "board-role", roleName: "BOARD_EDITOR", avatar: "" })) });
    if (config.url?.match(/^\/projects\/[^/]+$/)) return reply(config, { success: true, data: { id: config.url.split("/")[2], name: "Dự án liên kết sâu", status: "ACTIVE", membersCount: 12 } });
    throw new Error(`Unexpected request ${config.url}`);
  });
  axiosClient.defaults.adapter = adapter;
});
afterEach(() => { client.clear(); axiosClient.defaults.adapter = blocked; });

function mount(element: React.ReactNode, path = "/dashboard") {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><SidebarProvider>{element}</SidebarProvider></QueryClientProvider></MemoryRouter>);
}
function mountDashboard() { return mount(<><Dashboard /><WorkspacePanel open onClose={() => {}} /></>); }
function ProjectList() {
  const query = useProjects();
  return <><QueryFeedback query={query} label="dự án" />{pageItems(query.data).map((project) => <p key={project.id}>{project.name}</p>)}<LoadMore query={query} label="dự án" /></>;
}

it("lists active projects through all pages and opens the project's real route", async () => {
  projects = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, name: `Dự án ${index}`, status: index === 1 ? "ARCHIVED" : "ACTIVE", boardsCount: 0, membersCount: 1 }));
  mount(<Routes><Route path="/projects" element={<Projects />} /><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects");
  await screen.findByRole("link", { name: /Dự án 0/ });
  expect(screen.queryByRole("link", { name: /Dự án 1 / })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải thêm dự án" }));
  await userEvent.setup().click(await screen.findByRole("link", { name: /Dự án 11/ }));
  expect(await screen.findByRole("heading", { name: "Dự án liên kết sâu" })).toBeTruthy();
});

it("shows an empty project catalogue without turning missing counts into zero", async () => {
  projects = [];
  mount(<Projects />, "/projects");
  expect(await screen.findByText("Chưa có dự án đang hoạt động.")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("button", { name: "Tạo dự án" })).toBeTruthy();
});

it("groups visible project cards by role and explains archived rows in the loaded catalogue", async () => {
  projects = [
    { id: "managed", name: "Dự án quản lý", status: "ACTIVE", roleName: "PROJECT_ADMIN", boardsCount: 0, membersCount: 1 },
    { id: "joined", name: "Dự án thiết kế", status: "ACTIVE", roleName: "PROJECT_DESIGNER", description: "Cộng tác cùng nhóm" },
    { id: "old", name: "Dự án cũ", status: "ARCHIVED", roleName: "PROJECT_ADMIN" },
  ];
  mount(<Projects />, "/projects");
  const managed = await screen.findByRole("region", { name: "Dự án quản trị" });
  const joined = screen.getByRole("region", { name: "Dự án tham gia" });
  expect(within(managed).getByRole("link", { name: "Dự án quản lý" }).getAttribute("href")).toBe("/projects/managed");
  expect(within(managed).getByText("0 bảng")).toBeTruthy();
  expect(within(joined).getByText("Cộng tác cùng nhóm")).toBeTruthy();
  expect(within(joined).queryByText("0 bảng")).toBeNull();
  expect(screen.queryByRole("link", { name: "Dự án cũ" })).toBeNull();
  expect(screen.getByText(/Số lượng đã tải bao gồm cả dự án lưu trữ/)).toBeTruthy();
});

it("keeps a project's open board draft when dashboard group titles change language", async () => {
  mountDashboard();
  await screen.findByRole("link", { name: /Dự án Một/ });
  await userEvent.setup().click(await screen.findByRole("button", { name: "Thêm bảng" }));
  const input = screen.getByLabelText("Tên bảng");
  fireEvent.change(input, { target: { value: "Bảng đang soạn" } });
  await act(async () => { await i18n.changeLanguage("en"); });
  expect(screen.getByLabelText("Board name")).toBe(input);
  expect(input).toHaveProperty("value", "Bảng đang soạn");
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("retries the project catalogue after an error", async () => {
  adapter.mockRejectedValueOnce(new Error("Offline"));
  mount(<Projects />, "/projects");
  expect(await screen.findByRole("alert")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("link", { name: /Dự án Một/ })).toBeTruthy();
});

it("keeps project page context on a failed detail request and retries in place", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => { if (config.url === "/projects/p1") throw httpError(config, 500); return base(config); });
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/p1");
  expect(await screen.findByRole("heading", { level: 1, name: "Chi tiết dự án" })).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
  adapter.mockImplementation(base);
  await userEvent.setup().click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Dự án liên kết sâu" })).toBeTruthy();
});

it("shares catalogue requests between observers and appends the second project page", async () => {
  projects = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, name: `Dự án ${index}` }));
  mount(<><ProjectList /><ProjectList /></>);
  await screen.findAllByText("Dự án 0");
  expect(urls().filter((url) => url === "/projects")).toHaveLength(1);
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Tải thêm dự án" })[0]);
  expect(await screen.findAllByText("Dự án 11")).toHaveLength(2);
  expect(urls().filter((url) => url === "/projects")).toHaveLength(2);
  expect(adapter.mock.calls[1][0].params).toEqual({ page: 2, limit: 10 });
});

it.each([undefined, { currentPage: 2, totalPages: 2, totalItems: 12 }, { currentPage: 1, totalPages: -1, totalItems: 1 }])("rejects invalid pagination without silently truncating results (%j)", async (pagination) => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: projects, pagination }));
  mount(<ProjectList />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Dự án Một")).toBeNull();
});

it("exposes every board page in the project's center content", async () => {
  boards = Array.from({ length: 12 }, (_, index) => ({ id: `b${index}`, name: `Bảng ${index}`, projectId: "p1", status: "ACTIVE" }));
  mount(<ProjectBoardGrid projectId="p1" />);
  await screen.findByRole("link", { name: "Bảng 0" });
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải thêm bảng" }));
  expect(await screen.findByRole("link", { name: "Bảng 11" })).toBeTruthy();
  expect(urls().filter((url) => url === "/projects/p1/boards")).toHaveLength(2);
});

it("keeps custom project roles in participating projects and waits for all pages before guest classification", async () => {
  projects = Array.from({ length: 11 }, (_, index) => ({ id: `p${index}`, name: `Dự án ${index}`, status: "ACTIVE", roleName: "PROJECT_DESIGNER" }));
  boards = [{ id: "member-board", name: "Bảng dự án trang hai", projectId: "p10", status: "ACTIVE" }, { id: "guest", name: "Bảng khách thật", projectId: "other", status: "ACTIVE" }];
  mountDashboard();
  await screen.findByText("Dự án 0");
  expect(screen.queryByText("Bảng khách thật")).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải thêm dự án" }));
  await screen.findByText("Bảng khách thật");
  const guestSection = screen.getByRole("heading", { name: "Bảng ngoài dự án" }).parentElement!;
  expect(within(guestSection).queryByText("Bảng dự án trang hai")).toBeNull();
  expect(screen.getByRole("heading", { name: "Dự án tham gia" }).parentElement!.textContent).toContain("Dự án 10");
});

it("loads a project deep link and member previews directly while keeping role reads lazy", async () => {
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/outside-page-one");
  await screen.findByText("Dự án liên kết sâu");
  expect(urls()).toContain("/projects/outside-page-one");
  expect(urls()).not.toContain("/projects");
  expect(urls()).toContain("/projects/outside-page-one/members");
  expect(urls()).not.toContain("/roles");
});

it("shows real project metadata and board states in the detailed workspace", async () => {
  boards = [{ id: "active", projectId: "p1", name: "Bảng sản phẩm", description: "Kế hoạch phát hành", status: "ACTIVE", membersCount: 0, listsCount: 0 }, { id: "old", projectId: "p1", name: "Bảng cũ", status: "ARCHIVED" }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/projects/p1" ? reply(config, { success: true, data: { id: "p1", name: "Dự án sản phẩm", description: "Phát triển sản phẩm cùng nhóm.", status: "ACTIVE", membersCount: 12, boardsCount: 2 } }) : base(config));
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/p1");
  await screen.findByRole("heading", { name: "Dự án sản phẩm" });
  expect(screen.getByText("Phát triển sản phẩm cùng nhóm.")).toBeTruthy();
  expect(Array.from(screen.getByLabelText("Tổng quan dự án").querySelectorAll("dd"), (node) => node.textContent)).toEqual(["2", "12"]);
  const board = await screen.findByRole("link", { name: "Bảng sản phẩm" });
  expect(board.getAttribute("href")).toBe("/boards/active");
  expect(within(board).getByText("Kế hoạch phát hành")).toBeTruthy();
  expect(within(board).getByText("0 danh sách")).toBeTruthy();
  expect(within(board).getByText("0 thành viên")).toBeTruthy();
  expect(within(screen.getByRole("link", { name: "Bảng cũ" })).getByText("Đã lưu trữ")).toBeTruthy();
});

it("keeps missing project counts distinct from zero and creates from the board section header", async () => {
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/p1");
  await screen.findByRole("heading", { name: "Dự án liên kết sâu" });
  expect(Array.from(screen.getByLabelText("Tổng quan dự án").querySelectorAll("dd"), (node) => node.textContent)).toEqual(["—", "12"]);
  expect(await screen.findByText("Dự án chưa có bảng")).toBeTruthy();
  const section = screen.getByRole("region", { name: "Bảng của dự án" });
  const user = userEvent.setup();
  await user.click(within(section).getByRole("button", { name: "Tạo bảng" }));
  const input = screen.getByLabelText("Tên bảng");
  await user.type(input, "Bảng đang soạn");
  await act(async () => { await i18n.changeLanguage("en"); });
  expect(screen.getByLabelText("Board name")).toBe(input);
  expect(input).toHaveProperty("value", "Bảng đang soạn");
});

it("shows a resource error without suppressing another project's boards", async () => {
  projects.push({ id: "p2", name: "Dự án Hai", status: "ACTIVE", roleName: "PROJECT_MEMBER" });
  boards = [{ id: "b2", projectId: "p2", name: "Bảng vẫn truy cập", status: "ACTIVE" }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/projects/p1/boards") throw httpError(config, 403, "Denied project boards");
    return base(config);
  });
  mountDashboard();
  expect(await screen.findByText(/Denied project boards/)).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Bảng vẫn truy cập" })).toBeTruthy();
});

it.each(["project", "board"])("preserves a failed %s creation draft and prevents duplicate submits", async (kind) => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "post") { await gate.promise; throw httpError(config, 422, "Tên đã tồn tại"); }
    return base(config);
  });
  mount(kind === "project" ? <CreateProject /> : <CreateBoard projectId="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: kind === "project" ? "Tạo dự án" : "Thêm bảng" }));
  const nameLabel = kind === "project" ? "Tên dự án" : "Tên bảng";
  await user.type(screen.getByLabelText(nameLabel), "Giữ bản nháp");
  await user.type(screen.getByLabelText("Mô tả"), "Mô tả đang soạn");
  const form = screen.getByLabelText(nameLabel).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.method === "post")).toHaveLength(1));
  await act(async () => gate.resolve());
  await waitFor(() => expect((screen.getByRole("button", { name: kind === "project" ? "Tạo dự án" : "Tạo bảng" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByLabelText(nameLabel)).toHaveProperty("value", "Giữ bản nháp");
  expect(screen.getByLabelText("Mô tả")).toHaveProperty("value", "Mô tả đang soạn");
});

it("shows member avatars before opening, loads scoped roles on demand and reaches member 12", async () => {
  mount(<MembersDialog kind="projects" id="p1" count={12} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Thành viên dự án" }).querySelectorAll('[data-slot="avatar"]')).toHaveLength(3));
  expect(urls()).toContain("/projects/p1/members");
  expect(urls()).not.toContain("/roles");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText("Người 0");
  await user.click(screen.getByRole("combobox", { name: "Vai trò lời mời" }));
  expect(screen.getByRole("option", { name: "DESIGNER" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "OLD" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Biên tập viên" })).toBeNull();
  await user.click(screen.getByRole("option", { name: "DESIGNER" }));
  await user.click(screen.getByRole("button", { name: "Tải thêm thành viên" }));
  expect(await screen.findByText("Người 11")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "Vai trò của Người 0" }) as HTMLButtonElement).disabled).toBe(false);
});

it("renders the full unpaginated board membership and reports inherited access honestly", async () => {
  mount(<MembersDialog kind="boards" id="b1" />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Thành viên bảng" }));
  expect(await screen.findByText("Bạn 11")).toBeTruthy();
  expect(screen.getByText(/Quyền kế thừa từ dự án/)).toBeTruthy();
});

it("keeps the last admin on a 409 and displays the server conflict", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "delete") throw httpError(config, 409, "Project must retain at least one administrator");
    return base(config);
  });
  mount(<MembersDialog kind="projects" id="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText("Người 0");
  await user.click(screen.getByRole("button", { name: "Xóa Người 0 khỏi dự án" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Project must retain at least one administrator");
  expect(screen.getByText("Người 0")).toBeTruthy();
});

it("updates a member role and refreshes the member projection from the server", async () => {
  const base = adapter.getMockImplementation()!;
  let roleId = "admin";
  adapter.mockImplementation(async (config) => {
    if (config.url === "/projects/p1/members" && config.method === "patch") {
      roleId = JSON.parse(config.data).roleId;
      return reply(config, { success: true, data: {} });
    }
    if (config.url === "/projects/p1/members") return reply(config, paged([{
      id: "member", projectId: "p1", name: "Người chỉnh sửa", email: "member@example.test",
      roleId, roleName: roleId === "admin" ? "PROJECT_ADMIN" : "PROJECT_DESIGNER",
    }], Number(config.params?.page ?? 1)));
    return base(config);
  });
  mount(<MembersDialog kind="projects" id="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText("Người chỉnh sửa");
  await user.click(screen.getByRole("combobox", { name: "Vai trò của Người chỉnh sửa" }));
  await user.click(screen.getByRole("option", { name: "DESIGNER" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Vai trò của Người chỉnh sửa" }).textContent).toContain("DESIGNER"));
  const request = adapter.mock.calls.find(([config]) => config.method === "patch")![0];
  expect(request.url).toBe("/projects/p1/members");
  expect(JSON.parse(request.data)).toEqual({ userId: "member", roleId: "custom" });
  expect(adapter.mock.calls.filter(([config]) => config.method === "get" && config.url === "/projects/p1/members")).toHaveLength(2);
});

it.each(["SENT", "FAILED"] as const)("distinguishes saved invitation delivery %s and prevents accidental resend", async (delivery) => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/invitations/projects/p1" ? reply(config, {
    success: true, data: { id: "invite", delivery: { email: delivery, notification: "FAILED" } },
  }) : base(config));
  mount(<MembersDialog kind="projects" id="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText("Người 0");
  await user.type(screen.getByLabelText("Email thành viên mới"), "invitee@example.test");
  await user.click(screen.getByRole("combobox", { name: "Vai trò lời mời" }));
  await user.click(screen.getByRole("option", { name: "DESIGNER" }));
  await user.click(screen.getByRole("button", { name: "Gửi lời mời" }));
  await screen.findByText(delivery === "SENT" ? "Đã lưu và gửi email lời mời." : /Đã lưu lời mời nhưng gửi email thất bại/);
  expect(screen.getByText("Thông báo trong ứng dụng chưa gửi được.")).toBeTruthy();
  expect(screen.getByLabelText("Email thành viên mới")).toHaveProperty("value", "invitee@example.test");
  await user.click(screen.getByRole("button", { name: "Gửi lời mời" }));
  expect(urls().filter((url) => url === "/invitations/projects/p1")).toHaveLength(1);
});

it("retains the invitation draft when the delivery result is malformed", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => config.url === "/invitations/projects/p1"
    ? reply(config, { success: true, data: { id: "invite" } }) : base(config));
  mount(<MembersDialog kind="projects" id="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText("Người 0");
  await user.type(screen.getByLabelText("Email thành viên mới"), "draft@example.test");
  await user.click(screen.getByRole("combobox", { name: "Vai trò lời mời" }));
  await user.click(screen.getByRole("option", { name: "DESIGNER" }));
  await user.click(screen.getByRole("button", { name: "Gửi lời mời" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Không thể hoàn tất yêu cầu. Vui lòng thử lại.");
  expect(screen.getByLabelText("Email thành viên mới")).toHaveProperty("value", "draft@example.test");
  expect(screen.getByRole("combobox", { name: "Vai trò lời mời" }).textContent).toContain("DESIGNER");
});

it.each([
  ["projects", "restore"], ["projects", "delete"], ["boards", "restore"], ["boards", "delete"],
] as const)("%s %s refreshes the archived catalogue after the server confirms the change", async (kind, action) => {
  if (kind === "projects") projects = [{ id: "archived", name: "Mục lưu trữ", status: "ARCHIVED" }];
  else boards = [{ id: "archived", projectId: "other", name: "Mục lưu trữ", status: "ARCHIVED" }];
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch" || config.method === "delete") {
      const remaining = action === "restore" ? [{ id: "archived", name: "Mục lưu trữ", status: "ACTIVE" }] : [];
      if (kind === "projects") projects = remaining;
      else boards = remaining;
      return reply(config, { success: true, data: {} });
    }
    return base(config);
  });
  mount(<Archive />, "/archived");
  const user = userEvent.setup();
  if (kind === "boards") await user.click(await screen.findByRole("tab", { name: /Bảng/ }));
  const label = kind === "projects" ? "dự án" : "bảng";
  await user.click(await screen.findByRole("button", { name: `${action === "restore" ? "Khôi phục" : "Xóa"} ${label} Mục lưu trữ` }));
  if (action === "delete") await user.click(screen.getByRole("button", { name: "Xóa vĩnh viễn" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: `Khôi phục ${label} Mục lưu trữ` })).toBeNull());
  const request = adapter.mock.calls.find(([config]) => config.method === (action === "delete" ? "delete" : "patch"))![0];
  expect(request.url).toBe(`/${kind}/archived${action === "restore" ? "/restore" : ""}`);
  expect(adapter.mock.calls.filter(([config]) => config.method === "get" && config.url === `/${kind}`)).toHaveLength(2);
});

it("refreshes project metadata after a rename without a second store", async () => {
  let renamed = false;
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch") { renamed = true; return reply(config, { success: true, data: {} }); }
    if (config.url === "/projects/p1" && renamed) return reply(config, { success: true, data: { id: "p1", name: "Tên mới" } });
    return base(config);
  });
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/p1");
  const user = userEvent.setup();
  await user.dblClick(await screen.findByText("Dự án liên kết sâu"));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "Tên mới{Enter}");
  expect(await screen.findByText("Tên mới")).toBeTruthy();
  expect(adapter.mock.calls.filter(([config]) => config.method === "patch")).toHaveLength(1);
});

it("clears and revokes a failed background preview", async () => {
  const preview = vi.fn();
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:test-preview"; static revokeObjectURL = revoke; });
  adapter.mockImplementation(async (config) => { throw httpError(config, 422, "Invalid image"); });
  mount(<HeaderBoard boardId="b1" boardName="Bảng" onPreviewBackground={preview} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tùy chọn bảng" }));
  await user.click(screen.getByRole("menuitem", { name: "Đổi ảnh nền" }));
  await user.upload(screen.getByLabelText("Ảnh nền bảng"), new File(["image"], "cover.png", { type: "image/png" }));
  await waitFor(() => expect(preview).toHaveBeenLastCalledWith(null));
  expect(preview).toHaveBeenCalledWith("blob:test-preview");
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test-preview");
  const request = adapter.mock.calls.find(([config]) => config.method === "post")![0];
  expect(request.url).toBe("/boards/b1/background");
  expect(request.data.get("background")).toMatchObject({ name: "cover.png", type: "image/png" });
});

it("loads a board deep link independently of catalogue pages", async () => {
  adapter.mockImplementation(async (config) => reply(config, { success: true, data: { id: "outside-page", name: "Bảng liên kết sâu", projectId: "p-other", roleName: "PROJECT_CUSTOM" } }));
  function Detail() { const board = useBoard("outside-page"); return <p>{board.data?.name}</p>; }
  mount(<Detail />);
  expect(await screen.findByText("Bảng liên kết sâu")).toBeTruthy();
  expect(urls()).toEqual(["/boards/outside-page"]);
});

it("keeps one account's cached catalogue out of another account's render", async () => {
  const view = mount(<ProjectList />);
  await screen.findByText("Dự án Một");
  session.user = { id: "bob", name: "Bob", email: "bob@example.test" };
  projects = [{ id: "bob-project", name: "Dự án của Bob" }];
  view.rerender(<MemoryRouter><QueryClientProvider client={client}><ProjectList /></QueryClientProvider></MemoryRouter>);
  expect(screen.queryByText("Dự án Một")).toBeNull();
  expect(await screen.findByText("Dự án của Bob")).toBeTruthy();
});

it("does not erase members when roles fail and retries that resource alone", async () => {
  const base = adapter.getMockImplementation()!;
  let fail = true;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/roles" && fail) throw httpError(config, 500, "Roles unavailable");
    return base(config);
  });
  mount(<MembersDialog kind="projects" id="p1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên dự án" }));
  await screen.findByText(/Roles unavailable/);
  expect(await screen.findByText("Người 0")).toBeTruthy();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Vai trò lời mời" })).toHaveProperty("disabled", false));
  expect(urls().filter((url) => url === "/projects/p1/members")).toHaveLength(1);
});

it("retains an invitation draft and its scoped role after a server failure", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/invitations/boards/b1") throw httpError(config, 403, "Cannot invite with this role");
    return base(config);
  });
  mount(<MembersDialog kind="boards" id="b1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Thành viên bảng" }));
  await screen.findByText("Bạn 0");
  await user.type(screen.getByLabelText("Email thành viên mới"), "draft@example.test");
  await user.click(screen.getByRole("combobox", { name: "Vai trò lời mời" }));
  expect(screen.queryByRole("option", { name: "DESIGNER" })).toBeNull();
  await user.click(screen.getByRole("option", { name: "Biên tập viên" }));
  await user.click(screen.getByRole("button", { name: "Gửi lời mời" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Cannot invite with this role");
  expect(screen.getByLabelText("Email thành viên mới")).toHaveProperty("value", "draft@example.test");
  const request = adapter.mock.calls.find(([config]) => config.url === "/invitations/boards/b1")![0];
  expect(JSON.parse(request.data)).toEqual({ email: "draft@example.test", roleId: "board-role" });
});

it("aborts an upload on unmount and revokes its preview exactly once", async () => {
  const gate = deferred<void>();
  const preview = vi.fn();
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:unmounted"; static revokeObjectURL = revoke; });
  adapter.mockImplementation(async (config) => { await gate.promise; return reply(config, { success: true, data: {} }); });
  const view = mount(<HeaderBoard boardId="b1" onPreviewBackground={preview} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tùy chọn bảng" }));
  await user.click(screen.getByRole("menuitem", { name: "Đổi ảnh nền" }));
  await user.upload(screen.getByLabelText("Ảnh nền bảng"), new File(["image"], "cover.png", { type: "image/png" }));
  await waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.method === "post")).toHaveLength(1));
  const signal = adapter.mock.calls.find(([config]) => config.method === "post")![0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => gate.resolve());
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:unmounted");
  expect(preview).toHaveBeenCalledTimes(1);
});

it("reaches guest boards beyond the first global board page", async () => {
  boards = Array.from({ length: 12 }, (_, index) => ({ id: `guest${index}`, projectId: "other", name: `Bảng khách ${index}`, status: "ACTIVE" }));
  mountDashboard();
  await waitFor(() => expect(screen.getByLabelText("Số bảng đang hoạt động").textContent).toBe("10"));
  expect(within(screen.getByRole("region", { name: "Không gian làm việc" })).getByText("Danh mục đã tải")).toBeTruthy();
  await screen.findByRole("link", { name: "Bảng khách 0" });
  expect(screen.queryByRole("link", { name: "Bảng khách 11" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Tải thêm bảng trong danh mục" }));
  expect(await screen.findByRole("link", { name: "Bảng khách 11" })).toBeTruthy();
  expect(screen.getByLabelText("Số bảng đang hoạt động").textContent).toBe("12");
});

it.each([false, true])("distinguishes a missing board count from a confirmed zero (failure: %s)", async (fail) => {
  const gate = deferred<void>();
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/boards") {
      await gate.promise;
      if (fail) throw httpError(config, 503, "Danh mục tạm ngừng");
    }
    return base(config);
  });
  mountDashboard();
  expect(screen.getByLabelText("Số bảng đang hoạt động").textContent).toBe("—");
  await act(async () => gate.resolve());
  if (fail) {
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Số bảng đang hoạt động").textContent).toBe("—");
  } else await waitFor(() => expect(screen.getByLabelText("Số bảng đang hoạt động").textContent).toBe("0"));
});

it("does not refetch old catalogue observers from a callback belonging to an expired session", async () => {
  function Observer() {
    const invalidate = useInvalidateCatalog();
    return <><ProjectList /><button onClick={() => { void invalidate(); }}>Làm mới cache cũ</button></>;
  }
  mount(<Observer />);
  await screen.findByText("Dự án Một");
  const previousCalls = adapter.mock.calls.length;
  resetApiSession();
  await userEvent.setup().click(screen.getByRole("button", { name: "Làm mới cache cũ" }));
  expect(adapter.mock.calls).toHaveLength(previousCalls);
});


it("keeps a failed project rename draft across locale changes and Escape cancels without another request", async () => {
  const base = adapter.getMockImplementation()!;
  adapter.mockImplementation(async (config) => {
    if (config.method === "patch") throw httpError(config, 409, "Tên đã thay đổi ở phiên khác");
    return base(config);
  });
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes>, "/projects/p1");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Đổi tên dự án" }));
  const input = screen.getByRole("textbox", { name: "Tên dự án" });
  await user.clear(input);
  await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  expect(screen.getByRole("alert").textContent).toContain("Tên dự án không được để trống");
  expect(adapter.mock.calls.filter(([config]) => config.method === "patch")).toHaveLength(0);
  await user.type(input, "Bản nháp{Enter}");
  expect((await screen.findByRole("alert")).textContent).toContain("Tên đã thay đổi");
  await act(async () => { await i18n.changeLanguage("en"); });
  expect(screen.getByRole("textbox", { name: "Project name" })).toBe(input);
  expect(input).toHaveProperty("value", "Bản nháp");
  await user.click(input);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename project" }));
  expect(adapter.mock.calls.filter(([config]) => config.method === "patch")).toHaveLength(1);
});

it("keeps the project archive confirmation open on failure and blocks dismissal or duplicate writes while retrying", async () => {
  const base = adapter.getMockImplementation()!;
  const pending = deferred();
  let attempts = 0;
  adapter.mockImplementation(async (config) => {
    if (config.url === "/projects/p1/archive") {
      attempts++;
      if (attempts === 1) throw httpError(config, 403, "Không có quyền lưu trữ");
      await pending.promise;
      return reply(config, { success: true, data: {} });
    }
    return base(config);
  });
  mount(<Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /><Route path="/dashboard" element={<h1>Archive saved</h1>} /></Routes>, "/projects/p1");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Tùy chọn dự án" }));
  await user.click(screen.getByRole("menuitem", { name: "Lưu trữ dự án" }));
  const dialog = screen.getByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Lưu trữ dự án" }));
  expect((await within(dialog).findByRole("alert")).textContent).toContain("Không có quyền lưu trữ");
  const retry = within(dialog).getByRole("button", { name: "Lưu trữ dự án" });
  fireEvent.click(retry);
  fireEvent.click(retry);
  await waitFor(() => expect(attempts).toBe(2));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBe(dialog);
  expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveProperty("disabled", true);
  await act(async () => pending.resolve(undefined));
  expect(await screen.findByRole("heading", { name: "Archive saved" })).toBeTruthy();
});
