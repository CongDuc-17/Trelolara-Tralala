"use client";

import * as React from "react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUserStore } from "@/stores/user.store";
import { useProjects, type Board } from "@/hooks/useProjects";

import { GiSharkFin } from "react-icons/gi";
import { Link } from "react-router";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUserStore();
  // LẤY THÊM TRẠNG THÁI LOADING TỪ HOOK
  const { projects, userBoards, loading } = useProjects({
    includeBoards: true,
  });
  const { open, setOpen } = useSidebar();

  const guestBoardsList: Board[] = [];
  const memberProjectIds = new Set(projects.map((project) => project.id));

  for (const board of userBoards) {
    if (memberProjectIds.has(board.projectId ?? "")) {
      continue;
    }

    if (board.status === "ARCHIVED") {
      continue;
    } else if (board.status === "ACTIVE") {
      guestBoardsList.push(board);
    }
  }

  return (
    <Sidebar collapsible="icon" {...props} className="relative">
      {open && (
        <SidebarTrigger className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground absolute right-2 top-2" />
      )}

      <SidebarHeader>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Link
            to="/dashboard"
            className="flex items-center gap-2 w-full"
            onClick={(e) => {
              if (!open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GiSharkFin className="size-5" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Trelolara</span>
              <span className="truncate text-xs">Tralala</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        {/* TRUYỀN isLoading XUỐNG NAVMAIN */}
        <NavMain
          projects={projects}
          guestBoards={guestBoardsList}
          isLoading={loading}
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
