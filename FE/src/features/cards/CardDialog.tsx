import { lazy, useRef } from "react";
import { RouteBoundary } from "@/app/RouteBoundary";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DisplayPreferences } from "@/components/layout/DisplayPreferences";
import { useBoardLabels } from "@/features/catalog/queries";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { useBoardLists } from "@/features/boards/queries";
import { useCardDetail } from "./queries";
import { cardReturnPath } from "@/features/discovery/filters";
import { getApiError } from "@/lib/errors";

const CardDialogBody = lazy(() => import("./CardDialogBody").then(({ CardDialogBody }) => ({ default: CardDialogBody })));

export function CardDialog({ cardId, boardId }: { cardId: string; boardId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const close = () => navigate(cardReturnPath(pathname, search, boardId), { replace: true });
  const query = useCardDetail(boardId, cardId);
  const labels = useBoardLabels(boardId);
  const lists = useBoardLists(boardId);
  const card = ["forbidden", "unauthorized", "not-found"].includes(getApiError(query.error).kind) ? undefined : query.data;
  const list = lists.data?.find((list) => list.id === card?.listId);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => {
      event.preventDefault();
      const target = opener.current?.isConnected && opener.current !== document.body ? opener.current : document.getElementById(`task-link-${cardId}`) ?? document.getElementById("task-results-title") ?? document.getElementById(`board-card-${cardId}`) ?? document.getElementById("board-title");
      target?.focus();
    }} className="inset-0 left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-card p-0 shadow-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-4 md:px-6">
        <DialogHeader className="min-w-0 gap-1 text-left"><p className="text-xs text-muted-foreground">{list ? t("card.inList", { name: list.name }) : t("card.title")}</p><DialogTitle className="break-words text-base font-semibold leading-6 md:text-lg">{card?.title ?? t("card.title")}</DialogTitle><DialogDescription className="sr-only">{t("card.description")}</DialogDescription></DialogHeader>
        <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1"><DisplayPreferences /><Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("common.close")} onClick={close}><X className="size-4" /></Button></div>
      </div>
      <div data-card-detail-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
        {query.isError && <div className="mb-4"><QueryFeedback query={query} label={t("card.resource")} /></div>}
        {query.isPending ? <div role="status" aria-label={t("common.loading")} className="space-y-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div> : card ? <RouteBoundary fallback={<div role="status" aria-label={t("routes.loading")} className="space-y-5"><Skeleton className="h-9 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>}><CardDialogBody card={card} boardId={boardId} labels={labels} /></RouteBoundary> : !query.isError && <p className="py-8 text-center text-sm text-muted-foreground">{t("card.notFound")}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
