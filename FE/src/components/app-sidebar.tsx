import { useSidebar } from "@/components/ui/sidebar-context";
import { Archive, CheckCheck, CircleUserRound, Columns3, FolderKanban, LayoutDashboard, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { DisplayPreferences } from "@/components/layout/DisplayPreferences";
import { SidebarLogout } from "@/components/layout/SidebarLogout";

export function AppSidebar() {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation().pathname.toLowerCase();
  function closeMobile() { if (isMobile) setOpenMobile(false); }
  return <Sidebar collapsible="icon" variant="floating" className="dashboard-rail p-0 md:inset-y-5 md:left-5 md:h-auto">
    <SidebarHeader className="items-center gap-2 px-0 py-4">
      <Link to="/dashboard" onClick={closeMobile} className="workspace-brand inline-flex size-11 items-center justify-center rounded-md" aria-label={`Trelolara — ${t("nav.overview")}`} title="Trelolara"><Columns3 className="size-5 text-primary" /></Link>
      {isMobile && <SidebarMenuButton className="size-9 justify-center p-0" onClick={closeMobile} aria-label={t("nav.close")}><X /></SidebarMenuButton>}
    </SidebarHeader>
    <SidebarContent className="py-3">
      <nav aria-label={t("nav.main")}>
        <SidebarMenu className="items-center gap-2">
          {[
            { to: "/dashboard", label: "nav.overview", icon: LayoutDashboard, active: pathname === "/dashboard" },
            { to: "/my-work", label: "nav.myWork", icon: CheckCheck, active: pathname.startsWith("/my-work") },
            { to: "/projects", label: "nav.projects", icon: FolderKanban, active: pathname.startsWith("/projects") || pathname.startsWith("/boards") },
            { to: "/archived", label: "archive.title", icon: Archive, active: pathname === "/archived" },
            { to: "/me", label: "nav.profile", icon: CircleUserRound, active: pathname === "/me" },
          ].map(({ to, label, icon: Icon, active }) => <SidebarMenuItem key={to}>
            <SidebarMenuButton asChild tooltip={t(label)} isActive={active} className="size-11 justify-center p-3 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-3!">
              <Link to={to} aria-label={t(label)} aria-current={active ? "page" : undefined} onClick={closeMobile}><Icon /><span className="sr-only">{t(label)}</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu>
      </nav>
    </SidebarContent>
    <SidebarFooter className="items-center gap-4 px-0 pb-5">
      <div className="rail-preferences-full"><DisplayPreferences sidebar /></div>
      <div className="rail-preferences-menu"><DisplayPreferences /></div>
      <SidebarLogout />
    </SidebarFooter>
  </Sidebar>;
}
