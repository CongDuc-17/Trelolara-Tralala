import { useMemo } from "react"; // 1. Import thêm useMemo
import { CreateProject } from "@/components/projects/CreateProject";
import { Card } from "@/components/ui/card";
import { useProjects } from "@/hooks/useProjects";
import { Trello, EllipsisVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { CreateBoard } from "@/components/boards/CreateBoard";
import { Notifications } from "@/components/Notifications";
import { Toaster } from "@/components/ui/sonner";

import { Archived } from "@/components/Archived";
import { apiClient } from "@/lib/apiClient";

export function Dashboard() {
  const { projects, loading, error, fetchProjectsWithBoards } = useProjects({
    includeBoards: true,
  });

  const myProjects = useMemo(
    () =>
      projects
        .filter((p) => p.roleName === "PROJECT_ADMIN")
        .filter((p) => p.status === "ACTIVE"),
    [projects],
  );

  const clientProjects = useMemo(
    () =>
      projects
        .filter((p) => p.roleName !== "PROJECT_ADMIN")
        .filter((p) => p.status === "ACTIVE"),
    [projects],
  );

  const projectGroups = [
    { id: "my-projects", title: "My Projects", data: myProjects },
    { id: "client-projects", title: "Client Projects", data: clientProjects },
  ];

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.status === "ARCHIVED"),
    [projects],
  );

  const archivedBoards = useMemo(() => {
    const boards = [] as any[];

    projects.forEach((project) => {
      project.boards?.forEach((board) => {
        if (board.status === "ARCHIVED") {
          boards.push({
            ...board,
            projectName: project.name,
            projectStatus: project.status,
          });
        }
      });
    });

    return boards;
  }, [projects]);

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
      console.log("Restoring board with ID:", boardId);
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
          {error && <div>Error: {error}</div>}

          {!loading && !error && projects.length === 0 && (
            <div className="text-gray-500">No projects found.</div>
          )}
          {loading && projects.length === 0 && <div>Loading...</div>}
          {!error && projects.length > 0 && (
            <div className="flex flex-col gap-12">
              {projectGroups.map(
                (group) =>
                  group.data.length > 0 && ( // Chỉ hiển thị section nếu có project trong nhóm đó
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
                            <div className="flex items-center gap-4 cursor-pointer hover:bg-gray-100 p-2 rounded-full transition-colors">
                              <EllipsisVertical className="text-gray-500" />
                            </div>
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

                            <CreateBoard projectId={project.id} />
                          </div>
                        </div>
                      ))}
                    </section>
                  ),
              )}

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
