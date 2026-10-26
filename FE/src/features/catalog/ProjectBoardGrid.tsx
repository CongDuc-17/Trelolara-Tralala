import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUpRight, Columns3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { CreateBoard } from "@/components/boards/CreateBoard";
import { pageItems, useProjectBoards } from "./queries";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import type { Board } from "./types";
import { cn } from "@/lib/utils";

export function BoardTile({ board, detailed = false }: { board: Board; detailed?: boolean; }) {
  const { t } = useTranslation();
  return <Link to={`/boards/${board.id}`} aria-label={board.name}
    style={board.background ? { backgroundImage: `url(${JSON.stringify(board.background)})` } : undefined}
    className={cn("group relative isolate flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border bg-card bg-cover bg-center p-4 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring", detailed ? "min-h-36" : "min-h-28 justify-between", board.background ? "text-white" : "hover:bg-muted/40")}>
    {board.background && <span aria-hidden="true" className="absolute inset-0 -z-10 bg-black/75 transition-colors group-hover:bg-black/80" />}
    <div className={cn("flex items-start justify-between gap-3", board.background ? "text-white/80" : "text-muted-foreground")}>
      <div className="flex min-w-0 items-center gap-2"><Columns3 className="size-4 shrink-0" />{detailed && ["ACTIVE", "ARCHIVED"].includes(board.status ?? "") && <span className="text-xs">{t(board.status === "ACTIVE" ? "projects.active" : "projects.archived")}</span>}</div>
      <ArrowUpRight className={cn("size-4 transition-colors", !board.background && "group-hover:text-primary")} />
    </div>
    <div className="min-w-0"><div className="break-words text-sm font-semibold">{board.name}</div>
      {board.description && <p className={cn("mt-1 text-xs", detailed ? "line-clamp-2 break-words leading-5" : "truncate", board.background ? "text-white/80" : "text-muted-foreground")}>{board.description}</p>}
    </div>
    {detailed && (board.membersCount !== undefined || board.listsCount !== undefined) && <div className={cn("mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs tabular-nums", board.background ? "border-white/25 text-white/80" : "border-border/70 text-muted-foreground")}>
      {board.listsCount !== undefined && <span>{t("projects.listCount", { count: board.listsCount })}</span>}
      {board.membersCount !== undefined && <span>{t("common.members", { count: board.membersCount })}</span>}
    </div>}
  </Link>;
}

export function ProjectBoardGrid({ projectId, activeOnly = false, detailed = false }: { projectId: string; activeOnly?: boolean; detailed?: boolean; }) {
  const { t } = useTranslation();
  const query = useProjectBoards(projectId);
  const boards = pageItems(query.data).filter((board) => !activeOnly || board.status === "ACTIVE");
  const content = <>
    <QueryFeedback query={query} empty={boards.length === 0 && !detailed} label={t("common.board")} />
    {detailed && query.isSuccess && boards.length === 0 && <Empty className="items-start border p-5 text-left md:p-5"><EmptyHeader className="max-w-none items-start text-left"><EmptyTitle className="text-sm tracking-normal"><h3>{t("projects.emptyBoards")}</h3></EmptyTitle><EmptyDescription>{t("projects.emptyBoardsHint")}</EmptyDescription></EmptyHeader></Empty>}
    <div className={detailed ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3" : "grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3"}>
      {query.isPending && [1, 2].map((id) => <Skeleton key={id} className={detailed ? "h-36 w-full rounded-lg" : "h-28 w-full rounded-lg"} />)}
      {boards.map((board) => <BoardTile key={board.id} board={board} detailed={detailed} />)}
      {!detailed && <CreateBoard projectId={projectId} />}
    </div>
    <LoadMore query={query} label={t("common.board")} />
  </>;
  return detailed ? <section aria-label={t("projects.boardsTitle")} className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h2 className="text-base font-semibold">{t("projects.boardsTitle")}</h2><p className="text-sm text-muted-foreground">{t("projects.boardsHint")}</p></div><CreateBoard projectId={projectId} compact /></div>
    {content}
  </section> : <div>{content}</div>;
}
