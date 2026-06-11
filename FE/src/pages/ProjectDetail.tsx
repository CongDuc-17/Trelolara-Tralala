import { CreateBoard } from "@/components/boards/CreateBoard";
import { HeaderProject } from "@/components/projects/HeaderProject";
import { Card } from "@/components/ui/card";
import { useProjects } from "@/hooks/useProjects";
import { useProjectsStore } from "@/stores/projects.store";
import { Toaster } from "sonner";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectDetail() {
  const projectId = useParams().projectId as string;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchProjectById, fetchProjectBoards, fetchProjectMembers } =
    useProjects({ autoFetch: false });

  const project = useProjectsStore((state) =>
    state.projects.find((p) => p.id === projectId),
  );
  const boards = project?.boards ?? [];

  useEffect(() => {
    if (!projectId) {
      return;
    }

    async function fetchProjectDetailData() {
      setIsLoading(true);
      setError(null);
      try {
        await fetchProjectById(projectId);
        await Promise.all([
          fetchProjectBoards(projectId),
          fetchProjectMembers(projectId),
        ]);
      } catch (error) {
        setError(String(error));
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjectDetailData();
  }, [projectId]);

  return (
    <>
      <Toaster position="top-right" />
      <HeaderProject
        projectId={projectId}
        projectName={project?.name}
        isLoading={isLoading}
      />
      <main className="">
        <div className="grid grid-cols-4 gap-6 p-8">
          {error && <div>Error: {String(error)}</div>}

          {/* SKELETON LOADING UI CHỜ RENDER BOARDS */}
          {isLoading && (
            <>
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </>
          )}

          {!isLoading &&
            !error &&
            boards.map((b) => (
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

          {/* CHỈ HIỂN THỊ NÚT TẠO KHI ĐÃ LOAD XONG */}
          {!isLoading && !error && <CreateBoard projectId={projectId} />}
        </div>
      </main>
    </>
  );
}
