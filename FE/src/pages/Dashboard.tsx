import { useTranslation } from "react-i18next";
import { CreateProject } from "@/components/projects/CreateProject";
import { ArrowRight, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { pageItems, useProjects, useUserBoards } from "@/features/catalog/queries";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import { BoardTile, ProjectBoardGrid } from "@/features/catalog/ProjectBoardGrid";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { t } = useTranslation();
  const projectsQuery = useProjects();
  const boardsQuery = useUserBoards();
  const projects = pageItems(projectsQuery.data);
  const boards = pageItems(boardsQuery.data);
  const activeBoards = boards.filter((board) => board.status === "ACTIVE");
  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const membershipComplete = projectsQuery.isSuccess && !projectsQuery.hasNextPage;
  const memberIds = new Set(projects.map((project) => project.id));
  const guestBoards = membershipComplete ? activeBoards.filter((board) => !memberIds.has(board.projectId ?? "")) : [];
  const groups = [
    { id: "managed", title: t("overview.managed"), data: activeProjects.filter((project) => project.roleName === "PROJECT_ADMIN") },
    { id: "joined", title: t("overview.joined"), data: activeProjects.filter((project) => project.roleName !== "PROJECT_ADMIN") },
  ];

  return (
        <div className="app-page min-w-0 space-y-4 p-4 md:space-y-6 md:p-6">
          <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h1 className="text-2xl font-semibold tracking-tight">{t("overview.title")}</h1><p className="text-sm leading-6 text-muted-foreground">{t("overview.description")}</p></div><Button asChild className="h-11"><Link to="/my-work">{t("nav.myWork")}<ArrowRight className="size-4" /></Link></Button></header>
          <section aria-label={t("nav.workspace")} className="app-summary space-y-2 border-y py-3">
            <p className="text-xs text-muted-foreground">{t(boardsQuery.hasNextPage || projectsQuery.hasNextPage ? "overview.loadedCatalog" : "overview.yourCatalog")}</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                { label: t("overview.activeBoards"), value: boardsQuery.data ? activeBoards.length : "—", ariaLabel: t("overview.activeBoardsLabel") },
                { label: t("overview.activeProjects"), value: projectsQuery.data ? activeProjects.length : "—" },
              ].map((metric) => <div key={metric.label} className="flex min-w-0 items-baseline gap-2">
                <dt className="text-xs text-muted-foreground first-letter:uppercase">{metric.label}</dt>
                <dd aria-label={metric.ariaLabel} className="text-sm font-semibold tabular-nums">{metric.value}</dd>
              </div>)}
            </dl>
          </section>
          <div id="projects" className="scroll-mt-6 space-y-5">
            <div id="boards" className="grid scroll-mt-6 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
              <h2 className="text-base font-semibold">{t("overview.projectsTitle")}</h2>
              <Link to="/projects" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground">{t("overview.browse")}<ArrowRight className="size-4" /></Link>
              <p className="col-span-2 text-sm text-muted-foreground">{t("overview.projectsDescription")}</p>
            </div>
            <QueryFeedback query={projectsQuery} empty={activeProjects.length === 0} label={t("overview.activeProjects")} />
            {projectsQuery.isSuccess && activeProjects.length === 0 && <CreateProject />}
            {groups.map((group) => group.data.length > 0 && <section key={group.id} className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
              {group.data.map((project) => <article key={project.id} className="project-group space-y-3 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/projects/${project.id}`} className="inline-flex max-w-full items-center gap-2 rounded-sm font-medium hover:text-primary">
                      <FolderKanban className="size-4 shrink-0 text-muted-foreground" /><span className="break-words">{project.name}</span><ArrowRight className="size-3.5 shrink-0" />
                    </Link>
                  </div>
                  {project.membersCount !== undefined && <span className="shrink-0 text-xs text-muted-foreground">{t("common.members", { count: project.membersCount })}</span>}
                </div>
                <ProjectBoardGrid projectId={project.id} activeOnly />
              </article>)}
            </section>)}
            <LoadMore query={projectsQuery} label={t("common.project")} />
          </div>
          <section className="space-y-3 border-t pt-5">
            <h2 className="text-base font-semibold">{t("nav.guestBoards")}</h2>
            <p className="text-sm text-muted-foreground">{t("overview.guestDescription")}</p>
            {!membershipComplete && !projectsQuery.isError && <p className="text-sm text-muted-foreground">{t("overview.loadProjects")}</p>}
            {projectsQuery.isError && <p className="text-sm text-muted-foreground">{t("overview.retryProjects")}</p>}
            <QueryFeedback query={boardsQuery} empty={membershipComplete && guestBoards.length === 0} label={t(boardsQuery.hasNextPage ? "nav.guestLoaded" : "nav.guest")} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">{guestBoards.map((board) => <BoardTile key={board.id} board={board} />)}</div>
            <LoadMore query={boardsQuery} label={t("nav.catalogBoards")} />
          </section>
        </div>
  );
}
