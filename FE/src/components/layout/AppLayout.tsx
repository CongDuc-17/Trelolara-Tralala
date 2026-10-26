import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "./AppHeader";
import { WorkspacePanel } from "./WorkspacePanel";
import { Outlet, useLocation } from "react-router-dom";
import { useState, type CSSProperties } from "react";
import { RouteBoundary } from "@/app/RouteBoundary";

export function AppLayout() {
  const boardCanvas = /^\/boards\/[^/]+(?:\/cards\/[^/]+)?\/?$/.test(useLocation().pathname.toLowerCase());
  const [contextOpen, setContextOpen] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  function changeContextOpen(open: boolean) {
    setContextOpen(open);
    requestAnimationFrame(() => document.getElementById(open ? "dashboard-context-close" : "dashboard-context-toggle")?.focus());
  }
  return (
    <SidebarProvider open={false} className="dashboard-shell h-dvh min-h-0 gap-4 overflow-hidden p-3 md:p-5" style={{ "--sidebar-width-icon": "3.5rem" } as CSSProperties}>
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarInset id="main-content" tabIndex={-1} data-context-open={contextOpen} className="dashboard-grid min-h-0 min-w-0 w-auto flex-1 overflow-hidden bg-transparent shadow-none">
          <div className="dashboard-panel dashboard-heading p-4 pb-0 md:p-6 md:pb-0"><AppHeader contextOpen={contextOpen} onToggleContext={() => changeContextOpen(!contextOpen)} /></div>
          <div id="dashboard-main" tabIndex={-1} data-board-canvas={boardCanvas || undefined} className="dashboard-panel dashboard-main min-w-0">
            <RouteBoundary><Outlet /></RouteBoundary>
          </div>
          <WorkspacePanel open={contextOpen} onClose={() => changeContextOpen(false)} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
