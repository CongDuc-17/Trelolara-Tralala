import { Link, Outlet, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { useBoard } from "@/features/catalog/queries";
import { useBoardRealtime } from "@/features/boards/useBoardRealtime";
import { getApiError } from "@/lib/errors";
import { readTaskFilters } from "./filters";
import type { TaskFilters as Filters } from "./types";
import { useTaskSearch } from "./queries";
import { TaskFilters } from "./TaskFilters";
import { TaskResults } from "./TaskResults";

export function TaskScreen({ boardId, boardName }: { boardId?: string; boardName?: string }) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const [message, setMessage] = useState("");
  let filters: Filters = {}; let valid = true;
  try { filters = readTaskFilters(params, !!boardId); } catch { valid = false; }
  const query = useTaskSearch(filters, boardId, valid);
  const tasks = [...new Map(query.data?.pages.flatMap((page) => page.items.map((task) => [task.id, task] as const))).values()];
  const base = boardId ? `/boards/${boardId}/search` : "/my-work";
  const denied = ["forbidden", "unauthorized", "not-found"].includes(getApiError(query.error).kind);
  const cursorError = query.isError && getApiError(query.error).status === 422;
  const updated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString(i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
  return <div className="min-w-0 space-y-4 p-4 md:space-y-6 md:p-6">
    <header className="space-y-3">
      {boardId && <Link to={`/boards/${boardId}`} className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{boardName}</Link>}
      <div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h1 className="text-2xl font-semibold tracking-tight">{t(boardId ? "tasks.boardTitle" : "tasks.myTitle")}</h1><p className="text-sm leading-6 text-muted-foreground">{t(boardId ? "tasks.boardDescription" : "tasks.myDescription")}</p></div><Button variant="ghost" size="icon" className="size-11 shrink-0" disabled={query.isFetching || !valid} aria-label={t("tasks.refresh")} onClick={() => { void query.restart(); }}><RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} /></Button></div>
    </header>
    <p role="status" className={message ? "text-sm text-success" : "sr-only"}>{message}</p>
    {!valid ? <div role="alert" className="space-y-3 rounded-lg border p-4"><p className="text-sm">{t("tasks.invalidFilters")}</p><Button variant="outline" onClick={() => setParams({})}>{t("tasks.clearFilters")}</Button></div> : <>
      <div className="space-y-3">
      <TaskFilters filters={filters} boardId={boardId} tasks={denied ? [] : tasks} />
      {!boardId && <section aria-label={t("tasks.summary")} className="space-y-2 border-y py-3">
        <p className="text-xs text-muted-foreground">{t("tasks.summaryScope")}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:flex md:flex-wrap md:gap-x-6">
          {[
            { label: "tasks.loadedTotal", count: tasks.length },
            { label: "tasks.incomplete", count: tasks.filter((task) => !task.isComplete).length },
            { label: "tasks.complete", count: tasks.filter((task) => task.isComplete).length },
            { label: "tasks.due_overdue", count: tasks.filter((task) => !task.isComplete && task.isOverdue).length },
          ].map(({ label, count }) => <div key={label} className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="text-xs text-muted-foreground">{t(label)}</dt><dd className="text-sm font-semibold tabular-nums">{query.data && !denied ? count : "—"}</dd>
          </div>)}
        </dl>
      </section>}
      <section aria-labelledby="task-results-title" aria-busy={query.isFetching}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2"><h2 id="task-results-title" tabIndex={-1} className="text-base font-semibold">{t("tasks.results")}{boardId && query.data && !denied ? <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{t("tasks.loaded", { count: tasks.length })}</span> : null}</h2>{updated && <span className="text-xs text-muted-foreground">{t(query.isFetching ? "tasks.updating" : "tasks.updated", { time: updated })}</span>}</div>
        {query.isPending ? <div role="status" aria-label={t("common.loading")} className="divide-y">{[1, 2, 3].map((id) => <div key={id} className="flex gap-3 py-3"><Skeleton className="size-11 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></div>)}</div> : <>
          {!denied && <TaskResults tasks={tasks} base={base} search={search} onSaved={setMessage} />}
          {!query.isError && !tasks.length && <Empty className="items-start gap-3 border p-5 text-left md:p-5"><EmptyHeader className="max-w-none items-start text-left"><EmptyTitle className="text-sm tracking-normal"><h3>{t(Object.keys(filters).length ? "tasks.noMatches" : "tasks.empty")}</h3></EmptyTitle><EmptyDescription>{t(Object.keys(filters).length ? "tasks.noMatchesHint" : boardId ? "tasks.emptyBoardHint" : "tasks.emptyHint")}</EmptyDescription></EmptyHeader>{Object.keys(filters).length > 0 && <EmptyContent className="items-start"><Button variant="outline" className="h-11" onClick={() => setParams({})}>{t("tasks.clearFilters")}</Button></EmptyContent>}</Empty>}
          {query.isError && <div className="mt-3 space-y-2 rounded-lg border p-4"><p role="alert" className="text-sm">{t(cursorError ? "tasks.cursorExpired" : query.isFetchNextPageError ? "tasks.nextError" : "tasks.loadError")} {!cursorError && getApiError(query.error).message}</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => { if (query.isFetchNextPageError && !cursorError) void query.fetchNextPage(); else void query.restart(); }}>{t(cursorError ? "tasks.restart" : "common.retry")}</Button></div>}
          {query.hasNextPage && !query.isError && <div className="pt-4"><Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{t(query.isFetching ? "common.loading" : "tasks.loadMore")}</Button></div>}
        </>}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("tasks.order")}</p>
      </section>
      </div>
    </>}
    <Outlet />
  </div>;
}

export function BoardSearch() {
  const { boardId = "" } = useParams();
  const { t } = useTranslation();
  const board = useBoard(boardId);
  const realtime = useBoardRealtime(boardId, !!board.data && !board.isError);
  if (realtime.status === "forbidden") return <div className="space-y-3 p-4 md:p-6"><p role="alert">{t("board.accessLost")}</p><Button variant="outline" asChild><Link to="/dashboard">{t("board.back")}</Link></Button></div>;
  if (!board.data || ["forbidden", "unauthorized", "not-found"].includes(getApiError(board.error).kind)) return <div className="p-4 md:p-6"><QueryFeedback query={board} label={t("board.resource")} /></div>;
  return <>
    {realtime.status === "offline" && <div role="status" className="flex flex-wrap items-center gap-2 border-b px-4 py-1 text-xs text-muted-foreground"><span>{t("board.syncOffline")}</span><Button size="sm" variant="link" onClick={realtime.retry}>{t("common.retry")}</Button></div>}
    {board.isError && <div className="px-4 pt-4"><QueryFeedback query={board} label={t("board.resource")} /></div>}
    <TaskScreen key={boardId} boardId={boardId} boardName={board.data.name} />
  </>;
}
