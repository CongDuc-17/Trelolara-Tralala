import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Archived } from "@/components/Archived";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import { pageItems, useChangeCatalogLifecycle, useProjects, useUserBoards } from "@/features/catalog/queries";
import { getApiError } from "@/lib/errors";
import { Skeleton } from "@/components/ui/skeleton";

export function Archive() {
  const { t } = useTranslation();
  const projectsQuery = useProjects();
  const boardsQuery = useUserBoards();
  const lifecycle = useChangeCatalogLifecycle();
  const projects = pageItems(projectsQuery.data);
  const boards = pageItems(boardsQuery.data);

  async function changeResource(kind: "projects" | "boards", id: string, restore: boolean) {
    try { await lifecycle.mutateAsync({ kind, id, action: restore ? "restore" : "delete" }); toast.success(t(restore ? "archive.restored" : "archive.deleted")); }
    catch (error) { toast.error(getApiError(error).message); }
  }

  return <div className="min-w-0 space-y-4 p-4 md:space-y-6 md:p-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">{t("archive.title")}</h1><p className="text-sm text-muted-foreground">{t("archive.description")}</p></header>
    <section aria-label={t("archive.summary")} className="space-y-2 border-y py-3">
      <p className="text-xs text-muted-foreground">{t(projectsQuery.hasNextPage || boardsQuery.hasNextPage ? "overview.loadedCatalog" : "overview.yourCatalog")}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {[{ label: "archive.projects", value: projectsQuery.data ? projects.filter((project) => project.status === "ARCHIVED").length : "—" }, { label: "archive.boards", value: boardsQuery.data ? boards.filter((board) => board.status === "ARCHIVED").length : "—" }].map(({ label, value }) => <div key={label} className="flex min-w-0 items-baseline gap-2"><dt className="text-xs text-muted-foreground">{t(label)}</dt><dd className="text-sm font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
    </section>
    <section aria-label={t("archive.catalog")} className="space-y-4">
    <div><h2 className="text-base font-semibold">{t("archive.catalog")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("archive.catalogHint")}</p></div>
    <QueryFeedback query={projectsQuery} label={t("nav.projects").toLowerCase()} />
    <QueryFeedback query={boardsQuery} label={t("archive.boards").toLowerCase()} />
    {(projectsQuery.isPending || boardsQuery.isPending) && <div className="space-y-3">{[1, 2].map((id) => <div key={id} className="flex items-center justify-between gap-3 border-b py-3"><div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div><Skeleton className="h-11 w-28" /></div>)}</div>}
    {projectsQuery.data && boardsQuery.data && <Archived projects={projects} boards={boards} pending={lifecycle.isPending}
      handleRestoreProject={(id) => changeResource("projects", id, true)} handleDeleteProject={(id) => changeResource("projects", id, false)}
      handleRestoreBoard={(id) => changeResource("boards", id, true)} handleDeleteBoard={(id) => changeResource("boards", id, false)} />}
    {(projectsQuery.hasNextPage || boardsQuery.hasNextPage) && <p className="text-xs text-muted-foreground">{t("archive.partial")}</p>}
    <div className="flex flex-wrap justify-between gap-x-6 border-t pt-2"><LoadMore query={projectsQuery} label={t("archive.projectCatalog")} /><LoadMore query={boardsQuery} label={t("nav.catalogBoards")} /></div>
    </section>
  </div>;
}
