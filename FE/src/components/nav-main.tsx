import { useState } from "react";
import { ChevronRight, FolderKanban, KanbanSquare } from "lucide-react";
import type { Project } from "@/features/catalog/types";
import { pageItems, useProjectBoards, useProjects, useUserBoards } from "@/features/catalog/queries";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { Link } from "react-router-dom";

function ProjectNav({ project }: { project: Project; }) {
  const [open, setOpen] = useState(false);
  const boards = useProjectBoards(project.id, open);
  return <Collapsible open={open} onOpenChange={setOpen} asChild className="group/collapsible">
    <SidebarMenuItem>
      <CollapsibleTrigger asChild><SidebarMenuButton tooltip={project.name}>
        <FolderKanban /><span>{project.name}</span><ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
      </SidebarMenuButton></CollapsibleTrigger>
      <CollapsibleContent><SidebarMenuSub>
        <SidebarMenuSubItem><SidebarMenuSubButton asChild><Link to={`/projects/${project.id}`}>Xem dự án</Link></SidebarMenuSubButton></SidebarMenuSubItem>
        <QueryFeedback query={boards} label="bảng" empty={pageItems(boards.data).length === 0} />
        {pageItems(boards.data).filter((board) => board.status === "ACTIVE").map((board) => <SidebarMenuSubItem key={board.id}>
          <SidebarMenuSubButton asChild><Link to={`/boards/${board.id}`}><KanbanSquare /><span>{board.name}</span></Link></SidebarMenuSubButton>
        </SidebarMenuSubItem>)}
        <LoadMore query={boards} label="bảng" />
      </SidebarMenuSub></CollapsibleContent>
    </SidebarMenuItem>
  </Collapsible>;
}

export function NavMain() {
  const projects = useProjects();
  const boards = useUserBoards();
  const items = pageItems(projects.data);
  const memberIds = new Set(items.map((project) => project.id));
  const complete = projects.isSuccess && !projects.hasNextPage;
  const guests = complete ? pageItems(boards.data).filter((board) => !memberIds.has(board.projectId ?? "") && board.status === "ACTIVE") : [];
  return <>
    <SidebarGroup>
      <SidebarGroupLabel>Dự án</SidebarGroupLabel>
      <div className="px-2"><QueryFeedback query={projects} label="dự án" empty={items.length === 0} /></div>
      <SidebarMenu>{items.filter((project) => project.status === "ACTIVE").map((project) => <ProjectNav key={project.id} project={project} />)}</SidebarMenu>
      <div className="px-2"><LoadMore query={projects} label="dự án" /></div>
    </SidebarGroup>
    <SidebarGroup>
      <SidebarGroupLabel>Bảng khách</SidebarGroupLabel>
      {!complete && !projects.isError && <p className="px-2 text-xs text-muted-foreground">Cần tải hết dự án để phân loại.</p>}
      <div className="px-2"><QueryFeedback query={boards} label={boards.hasNextPage ? "bảng khách trong các trang đã tải" : "bảng khách"} empty={complete && guests.length === 0} /></div>
      <SidebarMenu>{guests.map((board) => <SidebarMenuItem key={board.id}><SidebarMenuButton asChild tooltip={board.name}>
        <Link to={`/boards/${board.id}`}><KanbanSquare /><span>{board.name}</span></Link>
      </SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
      <div className="px-2"><LoadMore query={boards} label="bảng trong danh mục" /></div>
    </SidebarGroup>
  </>;
}
