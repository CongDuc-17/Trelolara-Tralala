import { useMemo } from "react";
import { CreateProject } from "@/components/projects/CreateProject";
import { Card } from "@/components/ui/card";
import { useProjects } from "@/hooks/useProjects";
import type { Board, Project } from "@/hooks/useProjects";
import { Trello, EllipsisVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { CreateBoard } from "@/components/boards/CreateBoard";
import { Notifications } from "@/components/Notifications";
import { Toaster } from "@/components/ui/sonner";

import { Archived } from "@/components/Archived";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const { projects, userBoards, loading, error, fetchProjectsWithBoards } =
    useProjects({
      includeBoards: true,
    });

  const {
    myProjects,
    sharedProjects,
    guestBoards,
    archivedProjects,
    archivedBoards,
  } = useMemo(() => {
    const my: Project[] = [];
    const shared: Project[] = [];
    const guestBoardsList: Board[] = [];
    const archived: Project[] = [];
    const archivedBoardsList: Board[] = [];
    const memberProjectIds = new Set(projects.map((project) => project.id));

    for (const project of projects) {
      project.boards?.forEach((board) => {
        if (board.status === "ARCHIVED") {
          archivedBoardsList.push({ ...board, projectName: project.name });
        }
      });

      if (project.status === "ARCHIVED") {
        archived.push(project);
      } else if (project.status === "ACTIVE") {
        if (project.roleName === "PROJECT_ADMIN") {
          my.push(project);
        } else if (
          project.roleName === "PROJECT_MEMBER" ||
          project.roleName === "PROJECT_VIEWER" ||
          project.roleName === "MEMBER"
        ) {
          shared.push(project);
        } else {
          project.boards?.forEach((board) => {
            if (board.status === "ACTIVE") {
              guestBoardsList.push({ ...board, projectName: project.name });
            }
          });
        }
      }
    }

    for (const board of userBoards) {
      if (memberProjectIds.has(board.projectId ?? "")) {
        continue;
      }

      if (board.status === "ARCHIVED") {
        archivedBoardsList.push(board);
      } else if (board.status === "ACTIVE") {
        guestBoardsList.push(board);
      }
    }

    return {
      myProjects: my,
      sharedProjects: shared,
      guestBoards: guestBoardsList,
      archivedProjects: archived,
      archivedBoards: archivedBoardsList,
    };
  }, [projects, userBoards]);

  const projectGroups = [
    { id: "my-projects", title: "My Projects", data: myProjects },
    { id: "shared-projects", title: "Shared Projects", data: sharedProjects },
  ];

  const handleRestoreProject = async (projectId: string) => {
    try {
      await apiClient.patch(`/projects/${projectId}/restore`);
      await fetchProjectsWithBoards();
    } catch (error) {
      console.error("Error restoring project:", error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await apiClient.delete(`/projects/${projectId}`);
      await fetchProjectsWithBoards();
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  const handleRestoreBoard = async (boardId: string) => {
    try {
      await apiClient.patch(`/boards/${boardId}/restore`);
      await fetchProjectsWithBoards();
    } catch (error) {
      console.error("Error restoring board:", error);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await apiClient.delete(`/boards/${boardId}`);
      await fetchProjectsWithBoards();
    } catch (error) {
      console.error("Error deleting board:", error);
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="sticky w-full top-0 z-10 shadow-md flex justify-between items-center px-4 py-2 pr-12 bg-white">
        <h1 className="text-2xl font-bold p-4 ">Dashboard</h1>
        <Notifications />
      </div>
      <main className="h-screen overflow-y-auto pb-24">
        <div className="p-8 flex justify-between items-center">
          <div>
            <div className="text-3xl font-bold">Dashboard</div>
            <div className="text-gray-500 mt-1">
              Welcome to the Dashboard! Here you can manage your projects and
              tasks efficiently.
            </div>
          </div>
          <div>
            <CreateProject />
          </div>
        </div>

        <div className="pl-8">
          {error && <div>Error: {String(error)}</div>}

          {!loading &&
            !error &&
            projects.length === 0 &&
            userBoards.length === 0 && (
              <div className="text-gray-500">No projects found.</div>
            )}

          {/* SKELETON LOADING UI (Mô phỏng chính xác layout Project) */}
          {loading && projects.length === 0 && userBoards.length === 0 && (
            <div className="flex flex-col gap-12">
              <section>
                {/* Tên Section (VD: My Projects) */}
                <Skeleton className="h-8 w-48 mb-6" />

                <div className="mb-8">
                  <div className="flex justify-between items-start mr-8">
                    <div className="w-full">
                      {/* Icon Trello + Tên Project */}
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-8 w-8 rounded-md" />
                        <Skeleton className="h-8 w-64 rounded-md" />
                      </div>
                      {/* Description Project */}
                      <Skeleton className="h-5 w-96 mb-6 rounded-md" />
                    </div>
                    {/* Nút Options (Ellipsis) */}
                    <Skeleton className="h-10 w-10 rounded-full" />
                  </div>

                  {/* Lưới chứa 2 Boards */}
                  <div className="grid grid-cols-4 gap-6 pr-8">
                    <Skeleton className="h-36 w-full rounded-xl" />
                    <Skeleton className="h-36 w-full rounded-xl" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {!error && (projects.length > 0 || userBoards.length > 0) && (
            <div className="flex flex-col gap-12">
              {/* RENDER MY PROJECTS & SHARED PROJECTS */}
              {projectGroups.map(
                (group) =>
                  group.data.length > 0 && (
                    <section key={group.id}>
                      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2 mr-8">
                        {group.title}
                      </h2>

                      {group.data.map((project) => (
                        <div key={project.id} className="mb-8">
                          <div className="flex justify-between items-start mr-8">
                            <div>
                              <Link to={`/projects/${project.id}`}>
                                <div className="text-2xl font-medium mb-2 flex items-center gap-2 hover:text-blue-600 transition-colors">
                                  <Trello />
                                  {project.name}
                                </div>
                              </Link>
                              <div className="text-md text-gray-600 mb-6 flex items-center gap-2">
                                {project.description}
                              </div>
                            </div>
                            {/* <div className="flex items-center gap-4 cursor-pointer hover:bg-gray-100 p-2 rounded-full transition-colors">
                              <EllipsisVertical className="text-gray-500" />
                            </div> */}
                          </div>

                          <div className="grid grid-cols-4 gap-6 pr-8">
                            {project.boards
                              ?.filter((board) => board.status === "ACTIVE")
                              .map((b) => (
                                <Link to={`/boards/${b.id}`} key={b.id}>
                                  <Card
                                    className="h-36 cursor-pointer hover:shadow-lg transition-shadow relative overflow-hidden group"
                                    style={
                                      b.background
                                        ? {
                                            backgroundImage: `url(${b.background})`,
                                            backgroundSize: "cover",
                                            backgroundPosition: "center",
                                          }
                                        : { backgroundColor: "#f3f4f6" }
                                    }
                                  >
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                                    <div className="absolute bottom-0 w-full text-center p-2 bg-white/90 backdrop-blur-sm font-medium border-t">
                                      {b.name}
                                    </div>
                                  </Card>
                                </Link>
                              ))}

                            {/* Chỉ hiển thị nút CreateBoard ở những project thực sự là thành viên */}
                            <CreateBoard projectId={project.id} />
                          </div>
                        </div>
                      ))}
                    </section>
                  ),
              )}

              {/* RENDER GUEST BOARDS */}
              {guestBoards.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2 mr-8">
                    Guest Boards
                  </h2>
                  <div className="grid grid-cols-4 gap-6 pr-8">
                    {guestBoards.map((b) => (
                      <Link to={`/boards/${b.id}`} key={b.id}>
                        <Card
                          className="h-36 cursor-pointer hover:shadow-lg transition-shadow relative overflow-hidden group"
                          style={
                            b.background
                              ? {
                                  backgroundImage: `url(${b.background})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : { backgroundColor: "#f3f4f6" }
                          }
                        >
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                          <div className="absolute bottom-0 w-full flex flex-col p-2 bg-white/90 backdrop-blur-sm border-t text-center">
                            <span className="font-medium truncate">
                              {b.name}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* ARCHIVED SECTION */}
              <Archived
                projects={archivedProjects}
                boards={archivedBoards}
                handleRestoreProject={handleRestoreProject}
                handleDeleteProject={handleDeleteProject}
                handleRestoreBoard={handleRestoreBoard}
                handleDeleteBoard={handleDeleteBoard}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
