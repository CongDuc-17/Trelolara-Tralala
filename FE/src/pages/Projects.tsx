import { ArrowUpRight, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateProject } from "@/components/projects/CreateProject";
import { QueryFeedback, LoadMore } from "@/features/catalog/QueryFeedback";
import { pageItems, useProjects } from "@/features/catalog/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function Projects() {
  const { t } = useTranslation();
  const query = useProjects();
  const catalog = pageItems(query.data);
  const projects = catalog.filter((project) => project.status === "ACTIVE");
  const groups = [
    { id: "managed", title: t("overview.managed"), items: projects.filter((project) => project.roleName === "PROJECT_ADMIN") },
    { id: "joined", title: t("overview.joined"), items: projects.filter((project) => project.roleName !== "PROJECT_ADMIN") },
  ];
  return <div className="app-page min-w-0 space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 [&_button]:min-h-11">
      <div><h1 className="text-2xl font-semibold tracking-tight">{t("projects.title")}</h1><p className="mt-1.5 text-sm text-muted-foreground">{t("projects.description")}</p></div>
      <CreateProject />
    </header>
    {(query.isPending || query.isError || projects.length === 0) && <div className="space-y-4 rounded-lg border p-4">
      <QueryFeedback query={query} empty={projects.length === 0} label={t("overview.activeProjects")} />
      {query.isPending && <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">{[1, 2, 3].map((id) => <Skeleton key={id} className="h-36 rounded-lg" />)}</div>}
      {query.isSuccess && projects.length === 0 && <p className="text-sm text-muted-foreground">{t("projects.emptyHint")}</p>}
    </div>}
    {query.data && <p className="text-xs text-muted-foreground">{t(query.hasNextPage ? "projects.loadedActive" : "projects.totalActive", { count: projects.length })}</p>}
    {groups.map((group) => group.items.length > 0 && <section key={group.id} aria-labelledby={`projects-${group.id}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id={`projects-${group.id}`} className="text-base font-semibold">{group.title}</h2><Badge variant="secondary" className="font-normal tabular-nums text-muted-foreground">{t("projects.visibleCount", { count: group.items.length })}</Badge></div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        {group.items.map((project) => <li key={project.id} className="min-w-0">
          <Link to={`/projects/${project.id}`} aria-label={project.name} className="project-card group flex h-full min-h-36 min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-start gap-2"><FolderKanban className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><h3 className="min-w-0 flex-1 break-words text-sm font-semibold group-hover:text-primary">{project.name}</h3><ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" /></div>
            {project.description && <p className="line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{project.description}</p>}
            {(project.boardsCount !== undefined || project.membersCount !== undefined) && <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-xs tabular-nums text-muted-foreground">
              {project.boardsCount !== undefined && <span>{t("common.boards", { count: project.boardsCount })}</span>}{project.membersCount !== undefined && <span>{t("common.members", { count: project.membersCount })}</span>}
            </div>}
          </Link>
        </li>)}
      </ul>
    </section>)}
    <div><LoadMore query={query} label={t("common.project")} />{catalog.some((project) => project.status === "ARCHIVED") && <p className="text-xs text-muted-foreground">{t("projects.includingArchived")}</p>}</div>
  </div>;
}
