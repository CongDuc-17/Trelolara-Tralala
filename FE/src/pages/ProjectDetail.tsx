import { HeaderProject } from "@/components/projects/HeaderProject";
import { ProjectBoardGrid } from "@/features/catalog/ProjectBoardGrid";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { useProject } from "@/features/catalog/queries";
import { Toaster } from "sonner";
import { useParams } from "react-router-dom";

export function ProjectDetail() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  return <>
    <Toaster position="top-right" />
    {project.isError ? <div className="p-8"><QueryFeedback query={project} label="dự án" /></div> : <>
      <HeaderProject key={projectId} projectId={projectId} projectName={project.data?.name} membersCount={project.data?.membersCount} isLoading={project.isPending} />
      {!project.isPending && <main className="p-8"><ProjectBoardGrid projectId={projectId} /></main>}
    </>}
  </>;
}
