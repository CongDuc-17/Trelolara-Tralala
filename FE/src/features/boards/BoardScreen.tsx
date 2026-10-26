import { useCallback, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { HeaderBoard } from "@/components/boards/HeaderBoard";
import { ArchivePopover } from "@/components/boards/ArchivedOfBoard";
import { CreateList } from "@/components/lists/CreateList";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useBoard } from "@/features/catalog/queries";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { getApiError } from "@/lib/errors";
import { useBoardCards, useBoardLists } from "./queries";
import { useBoardActions } from "./useBoardActions";
import { BoardColumn } from "./BoardColumn";
import { ArchiveDropZone, BoardDnd } from "./BoardDnd";
import { useBoardRealtime } from "./useBoardRealtime";
import type { BoardState } from "./boardState";

export function BoardScreen({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const board = useBoard(boardId);
  const active = board.data?.status === "ACTIVE";
  const realtime = useBoardRealtime(boardId, active);
  const listsQuery = useBoardLists(boardId, active && realtime.status !== "forbidden");
  const lists = listsQuery.data ?? [];
  const cardQueries = useBoardCards(boardId, lists, active && realtime.status !== "forbidden");
  const cards = cardQueries.flatMap((query) => query.data ?? []);
  const state: BoardState = { lists, cards: Object.fromEntries(lists.flatMap((list, index) => cardQueries[index].data ? [[list.id, cardQueries[index].data]] : [])) };
  const actions = useBoardActions(boardId);
  const [previewBackground, setPreviewBackground] = useState<string | null>(null);
  const preview = useCallback((url: string | null) => setPreviewBackground(url), []);
  const background = previewBackground || board.data?.background;
  async function run(operation: () => Promise<unknown>) {
    try { await operation(); return true; }
    catch (error) { if (getApiError(error).kind !== "canceled") toast.error(getApiError(error).message); return false; }
  }
  const archive = <ArchiveDropZone>{(dropRef, isDragOver) => <ArchivePopover savedCards={cards.filter((card) => card.status === "ARCHIVED")} savedLists={lists.filter((list) => list.status === "ARCHIVED")} pending={actions.pending} dropRef={dropRef} isDragOver={isDragOver}
    feedback={<><QueryFeedback query={listsQuery} label={t("board.archiveListsResource")} />{cardQueries.map((query, index) => query.isError && <QueryFeedback key={lists[index].id} query={query} label={t("board.archiveCardsResource", { name: lists[index].name })} />)}</>}
    onRestoreCard={(card) => { void run(() => actions.lifecycle("cards", card.id, "restore")); }} onDeleteCard={(card) => run(() => actions.lifecycle("cards", card.id, "delete"))}
    onRestoreList={(list) => { void run(() => actions.lifecycle("lists", list.id, "restore")); }} onDeleteList={(list) => run(() => actions.lifecycle("lists", list.id, "delete"))} />}</ArchiveDropZone>;

  if (realtime.status === "forbidden") return <div role="alert" className="space-y-4 p-4 md:p-6"><p>{t("board.accessLost")}</p><Button variant="outline" asChild><Link to="/dashboard">{t("board.back")}</Link></Button></div>;
  if (board.isPending) return <div role="status" aria-label={t("common.loading")} className="flex h-full flex-col gap-6 p-4 md:p-6"><Skeleton className="h-8 w-48" /><div className="flex min-h-0 gap-4 overflow-hidden">{[1, 2, 3].map((id) => <div key={id} className="w-80 shrink-0 space-y-3 rounded-lg bg-background p-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-24 w-full bg-card" /><Skeleton className="h-24 w-full bg-card" /></div>)}</div></div>;
  if (!board.data) return <div className="p-4 md:p-6"><QueryFeedback query={board} label={t("board.resource")} /></div>;
  if (!active) return <div className="space-y-4 p-4 md:p-6"><h1 className="text-2xl font-semibold">{board.data.name}</h1><p className="text-sm text-muted-foreground">{t("board.archived")}</p><Button variant="outline" asChild><Link to="/dashboard">{t("board.back")}</Link></Button></div>;
  return <BoardDnd state={state} onMove={(intent) => { void run(() => intent.kind === "card" ? actions.moveCard(intent.id, intent.listId!, intent.targetId, intent.direction) : actions.moveList(intent.id, intent.targetId, intent.direction)); }} onArchive={(kind, id) => { void run(() => actions.lifecycle(kind === "card" ? "cards" : "lists", id, "archive")); }}>
    {(view, dragging) => <div data-board-dragging={dragging || undefined} className="flex h-full min-h-0 flex-col overflow-hidden bg-frame" style={background ? { backgroundImage: `url(${background})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      <HeaderBoard boardId={boardId} boardName={board.data.name} membersCount={board.data.memberCount} onPreviewBackground={preview} archive={archive} />
      <div className="sr-only" role="status">{actions.pending ? t("common.saving") : ""}</div>
      {realtime.status === "offline" && <div role="status" className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-1 text-xs text-muted-foreground"><span>{t("board.syncOffline")}</span><Button size="sm" variant="link" onClick={realtime.retry}>{t("common.retry")}</Button></div>}
      {board.isError && <div className="bg-card px-4 py-2"><QueryFeedback query={board} label={t("board.details")} /></div>}
      <div role="region" aria-label={t("board.canvas")} tabIndex={0} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        <QueryFeedback query={listsQuery} label={t("board.lists")} />
        {listsQuery.isSuccess && view.lists.filter((list) => list.status === "ACTIVE").length === 0 ? <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center"><h2 className="text-base font-semibold">{t("board.empty")}</h2><p className="text-sm text-muted-foreground">{t("board.emptyDescription")}</p><CreateList boardId={boardId} createList={actions.createList} loading={actions.pending} /></div>
          : <div className="flex h-full min-h-0 items-start gap-4">
            {view.lists.filter((list) => list.status === "ACTIVE").map((list) => <BoardColumn key={list.id} boardId={boardId} list={list} lists={view.lists.filter((list) => list.status === "ACTIVE")} cards={view.cards[list.id]} query={cardQueries[lists.findIndex((item) => item.id === list.id)]} actions={actions} run={run} />)}
            <div className="w-80 max-w-[calc(100vw-2rem)] shrink-0"><CreateList boardId={boardId} createList={actions.createList} loading={actions.pending} /></div>
          </div>}
      </div>
      <Outlet />
    </div>}
  </BoardDnd>;
}
