import { HeaderProject } from "@/components/projects/HeaderProject";
import { ProjectBoardGrid } from "@/features/catalog/ProjectBoardGrid";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { useProject } from "@/features/catalog/queries";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectDetail() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  return <div className="app-page min-w-0 space-y-6 p-4 md:p-6">
    {project.isError ? <><h1 className="text-2xl font-semibold tracking-tight">{t("nav.projectDetail")}</h1><QueryFeedback query={project} label={t("common.project")} /></> : <>
      <HeaderProject key={projectId} projectId={projectId} projectName={project.data?.name} description={project.data?.description} status={project.data?.status} membersCount={project.data?.membersCount} isLoading={project.isPending} />
      <dl className="app-summary flex flex-wrap gap-x-6 gap-y-2 border-y py-3" aria-label={t("projects.summary")}>
        {[{ label: t("projects.boardCount"), value: project.data?.boardsCount }, { label: t("membersDialog.members"), value: project.data?.membersCount }].map(({ label, value }) => <div key={label} className="flex min-w-0 items-baseline gap-2">
          <dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-semibold tabular-nums">{project.isPending ? <Skeleton className="h-4 w-8" aria-label={t("common.loading")} /> : value ?? "—"}</dd>
        </div>)}
      </dl>
      {!project.isPending && <ProjectBoardGrid projectId={projectId} detailed />}
    </>}
  </div>;
}
