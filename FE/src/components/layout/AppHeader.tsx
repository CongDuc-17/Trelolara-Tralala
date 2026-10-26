import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Notifications } from "@/components/Notifications";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useSession } from "@/features/auth/session-context";

export function AppHeader({ contextOpen, onToggleContext }: { contextOpen: boolean; onToggleContext: () => void }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const { toggleSidebar, isMobile } = useSidebar();
  const { pathname, hash } = useLocation();
  const path = pathname.toLowerCase();
  const isBoard = path.startsWith("/boards/");
  const isProject = /^\/projects\/[^/]+/.test(path);
  const isCard = path.includes("/cards/");
  const isSearch = path.includes("/search");
  const scrollPath = path.split("/cards/")[0].replace(/\/my-work\/boards\/[^/]+$/, "/my-work");
  const title = path.startsWith("/my-work") ? t("nav.myWork") : path === "/archived" ? t("archive.title") : isSearch ? t("tasks.boardTitle") : path === "/me" ? t("nav.profile") : isBoard ? t("nav.board") : isProject ? t("nav.projectDetail") : path.startsWith("/projects") ? t("nav.projects") : t("nav.overview");
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else document.getElementById("dashboard-main")?.scrollTo({ top: 0 });
  }, [scrollPath, hash]);
  return <header className="z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 gap-y-3 md:flex md:items-center md:justify-between [&_button]:min-h-11 [&_button]:min-w-11">
    <a href="#dashboard-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">{t("nav.skip")}</a>
    <div className="contents md:flex md:min-w-0 md:items-center md:gap-2">
      {isMobile && <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={toggleSidebar} aria-label={t("nav.open")}><Menu /></Button>}
      <Breadcrumb aria-label={t("nav.breadcrumb")} className="col-span-2 row-start-2 min-w-0">
        <BreadcrumbList className="min-w-0 flex-nowrap gap-2 sm:gap-2">
          <BreadcrumbItem className="shrink-0"><BreadcrumbLink asChild><Link to="/dashboard">Trelolara</Link></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="shrink-0" />
          {(isBoard || isProject) && <><BreadcrumbItem className="hidden shrink-0 sm:inline-flex"><BreadcrumbLink asChild><Link to="/projects">{t("nav.projects")}</Link></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden shrink-0 sm:block" /></>}
          <BreadcrumbItem className="min-w-0">{isCard ? <span className="truncate font-medium text-foreground">{title}</span> : <BreadcrumbPage className="truncate font-medium">{title}</BreadcrumbPage>}</BreadcrumbItem>
          {isCard && <><BreadcrumbSeparator className="hidden shrink-0 sm:block" /><BreadcrumbItem className="sr-only sm:not-sr-only sm:min-w-0"><BreadcrumbPage className="truncate text-muted-foreground">{t("nav.card")}</BreadcrumbPage></BreadcrumbItem></>}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
    <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-1">
      <Notifications key={user?.id} />
      <Button id="dashboard-context-toggle" variant="ghost" size="icon" aria-label={t(contextOpen ? "overview.hideInfo" : "overview.showInfo")} title={t(contextOpen ? "overview.hideInfo" : "overview.showInfo")} aria-controls="dashboard-context" aria-expanded={contextOpen} onClick={onToggleContext}>{contextOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
    </div>
  </header>;
}
