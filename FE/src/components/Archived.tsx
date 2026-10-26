import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Board, Project } from "@/features/catalog/types";

type ArchivedProps = {
  projects: Project[];
  boards: Board[];
  pending?: boolean;
  handleRestoreProject: (projectId: string) => void;
  handleDeleteProject: (projectId: string) => void;
  handleRestoreBoard: (boardId: string) => void;
  handleDeleteBoard: (boardId: string) => void;
};

export function Archived({ projects, boards, pending, handleRestoreProject, handleDeleteProject, handleRestoreBoard, handleDeleteBoard }: ArchivedProps) {
  const { t } = useTranslation();
  const [toDelete, setToDelete] = useState<{ kind: "projects" | "boards"; id: string; name: string } | null>(null);
  const archivedProjects = projects.filter((project) => project.status === "ARCHIVED");
  const archivedBoards = boards.filter((board) => board.status === "ARCHIVED");

  return <>
    <Tabs defaultValue="projects" className="min-w-0 gap-4">
      <TabsList variant="line" className="h-11! w-full justify-start border-b sm:w-auto [&_button]:h-11 [&_button]:flex-none [&_button]:px-4">
        <TabsTrigger value="projects">{t("archive.projects")}</TabsTrigger>
        <TabsTrigger value="boards">{t("archive.boards")}</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="divide-y">
        {!archivedProjects.length && <Empty className="items-start gap-3 border p-5 text-left md:p-5"><EmptyHeader className="max-w-none items-start text-left"><EmptyTitle className="text-sm tracking-normal">{t("archive.emptyProjects")}</EmptyTitle><EmptyDescription>{t("archive.emptyHint")}</EmptyDescription></EmptyHeader><EmptyContent className="items-start"><Button asChild variant="outline" className="h-11"><Link to="/projects">{t("overview.browse")}</Link></Button></EmptyContent></Empty>}
        {archivedProjects.map((project) => <article key={project.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <h3 className="break-words text-sm font-medium">{project.name}</h3>
            {project.description && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{project.description}</p>}
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {project.boardsCount != null && <span>{t("common.boards", { count: project.boardsCount })}</span>}
              {project.membersCount != null && <span>{t("common.members", { count: project.membersCount })}</span>}
            </p>
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="outline" className="h-11 gap-2 border-border bg-card shadow-none" disabled={pending} aria-label={`${t("archive.restoreProject")} ${project.name}`} onClick={() => handleRestoreProject(project.id)}><ArchiveRestore className="size-4" />{t("archive.restore")}</Button>
            <Button variant="ghost" size="icon" className="size-11 text-destructive hover:text-destructive" disabled={pending} aria-label={`${t("archive.deleteProject")} ${project.name}`} title={t("archive.deleteProject")} onClick={() => setToDelete({ kind: "projects", id: project.id, name: project.name })}><Trash2 className="size-4" /></Button>
          </div>
        </article>)}
      </TabsContent>
      <TabsContent value="boards" className="divide-y">
        {!archivedBoards.length && <Empty className="items-start gap-3 border p-5 text-left md:p-5"><EmptyHeader className="max-w-none items-start text-left"><EmptyTitle className="text-sm tracking-normal">{t("archive.emptyBoards")}</EmptyTitle><EmptyDescription>{t("archive.emptyHint")}</EmptyDescription></EmptyHeader><EmptyContent className="items-start"><Button asChild variant="outline" className="h-11"><Link to="/dashboard">{t("overview.projectsTitle")}</Link></Button></EmptyContent></Empty>}
        {archivedBoards.map((board) => <article key={board.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 basis-48 space-y-1"><h3 className="break-words text-sm font-medium">{board.name}</h3>{board.projectName && <p className="break-words text-xs text-muted-foreground">{board.projectName}</p>}</div>
          <div className="flex justify-end gap-1">
          <Button variant="outline" className="h-11 shrink-0 gap-2 border-border bg-card shadow-none" disabled={pending} aria-label={`${t("archive.restoreBoard")} ${board.name}`} onClick={() => handleRestoreBoard(board.id)}><ArchiveRestore className="size-4" />{t("archive.restore")}</Button>
          <Button variant="ghost" size="icon" className="size-11 shrink-0 text-destructive hover:text-destructive" disabled={pending} aria-label={`${t("archive.deleteBoard")} ${board.name}`} title={t("archive.deleteBoard")} onClick={() => setToDelete({ kind: "boards", id: board.id, name: board.name })}><Trash2 className="size-4" /></Button>
          </div>
        </article>)}
      </TabsContent>
    </Tabs>
    <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("archive.confirmTitle")}</AlertDialogTitle><AlertDialogDescription>{t("archive.confirmDescription")}</AlertDialogDescription></AlertDialogHeader>
        <p className="break-words text-sm font-medium">{toDelete?.name}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => { if (toDelete) { if (toDelete.kind === "projects") handleDeleteProject(toDelete.id); else handleDeleteBoard(toDelete.id); } }}>{t("archive.delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
