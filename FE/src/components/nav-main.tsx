import { ChevronRight, FolderKanban, KanbanSquare } from "lucide-react";
import type { Board, Project } from "@/hooks/useProjects";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

type NavMainProps = {
  projects: Project[];
  guestBoards: Board[];
  isLoading?: boolean; // THÊM PROP NÀY
};

export function NavMain({ projects, guestBoards, isLoading }: NavMainProps) {
  // NẾU ĐANG LOADING THÌ RENDER SKELETON

  if (isLoading) {
    return (
      <>
        <SidebarGroup>
          <SidebarGroupLabel>
            <Skeleton className="h-4 w-16" />
          </SidebarGroupLabel>
          <SidebarMenu>
            {/* Tạo mảng giả lập 3 Projects đang load */}
            {[1, 2, 3].map((i) => (
              <SidebarMenuItem key={`skeleton-project-${i}`}>
                <SidebarMenuButton disabled>
                  <Skeleton className="h-4 w-4 rounded-md" />{" "}
                  {/* Icon Folder */}
                  <Skeleton className="h-4 w-32" /> {/* Tên Project */}
                  <Skeleton className="h-4 w-4 rounded-full ml-auto" />{" "}
                  {/* Chevron */}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <Skeleton className="h-4 w-24" />
          </SidebarGroupLabel>
          <SidebarMenu>
            {/* Tạo mảng giả lập 2 Guest Boards đang load */}
            {[1, 2].map((i) => (
              <SidebarMenuItem key={`skeleton-guest-${i}`}>
                <SidebarMenuButton disabled>
                  <Skeleton className="h-4 w-4 rounded-md" /> {/* Icon Board */}
                  <Skeleton className="h-4 w-24" /> {/* Tên Board */}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </>
    );
  }

  // RENDER DỮ LIỆU THẬT KHI ĐÃ LOAD XONG
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarMenu>
          {projects.map(
            (item) =>
              item.status === "ACTIVE" && (
                <Collapsible
                  key={item.id}
                  asChild
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.name}>
                        <FolderKanban />
                        <span>{item.name}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.boards
                          ?.filter((board) => board.status === "ACTIVE")
                          .map((board) => (
                            <SidebarMenuSubItem key={board.id}>
                              <SidebarMenuSubButton asChild>
                                <Link to={`/boards/${board.id}`}>
                                  <KanbanSquare />
                                  <span>{board.name}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ),
          )}
        </SidebarMenu>
      </SidebarGroup>

      {guestBoards.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>Guest Boards</SidebarGroupLabel>
          <SidebarMenu>
            {guestBoards.map((board) => (
              <SidebarMenuItem key={board.id}>
                <SidebarMenuButton asChild tooltip={board.name}>
                  <Link to={`/boards/${board.id}`}>
                    <KanbanSquare />
                    <span>{board.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}
