import { CreateProject } from "@/components/projects/CreateProject";
import { Trello } from "lucide-react";
import { Link } from "react-router-dom";
import { Notifications } from "@/components/Notifications";
import { Toaster } from "@/components/ui/sonner";
import { Archived } from "@/components/Archived";
import { apiClient } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { toast } from "sonner";
import { pageItems, useInvalidateCatalog, useProjects, useUserBoards } from "@/features/catalog/queries";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import { BoardTile, ProjectBoardGrid } from "@/features/catalog/ProjectBoardGrid";

export function Dashboard() {
  const projectsQuery = useProjects();
  const boardsQuery = useUserBoards();
  const invalidate = useInvalidateCatalog();
  const projects = pageItems(projectsQuery.data);
  const boards = pageItems(boardsQuery.data);
  const membershipComplete = projectsQuery.isSuccess && !projectsQuery.hasNextPage;
  const memberIds = new Set(projects.map((project) => project.id));
  const guestBoards = membershipComplete ? boards.filter((board) => !memberIds.has(board.projectId ?? "") && board.status === "ACTIVE") : [];
  const groups = [
    { title: "Dự án quản trị", data: projects.filter((project) => project.status === "ACTIVE" && project.roleName === "PROJECT_ADMIN") },
    { title: "Dự án tham gia", data: projects.filter((project) => project.status === "ACTIVE" && project.roleName !== "PROJECT_ADMIN") },
  ];

  async function changeResource(kind: "projects" | "boards", id: string, restore: boolean) {
    try {
      if (restore) await apiClient.patch(`/${kind}/${id}/restore`);
      else await apiClient.delete(`/${kind}/${id}`);
      await invalidate();
    } catch (error) {
      toast.error(getApiError(error).message);
    }
  }

  return <>
    <Toaster position="top-right" />
    <header className="sticky w-full top-0 z-10 shadow-md flex justify-between items-center px-4 py-2 pr-12 bg-white">
      <h1 className="text-2xl font-bold p-4">Tổng quan</h1><Notifications />
    </header>
    <main className="h-screen overflow-y-auto pb-24">
      <div className="flex justify-between items-center p-8">
        <div><div className="text-3xl font-bold">Tổng quan</div><div className="text-gray-500 mt-1">Quản lý dự án và công việc của bạn.</div></div>
        <CreateProject />
      </div>
      <div className="pl-8 pr-8 space-y-8">
        <QueryFeedback query={projectsQuery} empty={projects.length === 0} label="dự án" />
        <div className="flex flex-col gap-12">
          {groups.map((group) => group.data.length > 0 && <section key={group.title}>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">{group.title}</h2>
            {group.data.map((project) => <div key={project.id} className="mb-8">
              <Link to={`/projects/${project.id}`}><div className="text-2xl font-medium mb-2 flex items-center gap-2 hover:text-blue-600 transition-colors"><Trello />{project.name}</div></Link>
              <div className="text-md text-gray-600 mb-6">{project.description}</div>
              <ProjectBoardGrid projectId={project.id} activeOnly />
            </div>)}
          </section>)}
        </div>
        <LoadMore query={projectsQuery} label="dự án" />
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">Bảng khách</h2>
          {!membershipComplete && !projectsQuery.isError && <p className="text-sm text-muted-foreground">Tải hết danh mục dự án để xác định bảng khách.</p>}
          <QueryFeedback query={boardsQuery} empty={membershipComplete && guestBoards.length === 0} label={boardsQuery.hasNextPage ? "bảng khách trong các trang đã tải" : "bảng khách"} />
          <div className="grid grid-cols-4 gap-6">{guestBoards.map((board) => <BoardTile key={board.id} board={board} />)}</div>
          <LoadMore query={boardsQuery} label="bảng trong danh mục" />
        </section>
        <Archived projects={projects.filter((project) => project.status === "ARCHIVED")} boards={boards.filter((board) => board.status === "ARCHIVED")}
          handleRestoreProject={(id) => changeResource("projects", id, true)} handleDeleteProject={(id) => changeResource("projects", id, false)}
          handleRestoreBoard={(id) => changeResource("boards", id, true)} handleDeleteBoard={(id) => changeResource("boards", id, false)} />
      </div>
    </main>
  </>;
}
