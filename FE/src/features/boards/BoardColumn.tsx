import { useMemo, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Archive, GripVertical, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreateCard } from "@/components/cards/CreateCard";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import type { CardSummary } from "@/features/cards/types";
import type { List } from "./types";
import type { useBoardActions } from "./useBoardActions";
import { BoardCard } from "./BoardCard";
import { cardDragId, listDragId, listDropId, useReducedBoardMotion } from "./drag";

export function BoardColumn({ list, lists, query, cards: rows, boardId, actions, run }: {
  list: List; lists: List[]; query?: UseQueryResult<CardSummary[], Error>; cards?: CardSummary[]; boardId: string;
  actions: ReturnType<typeof useBoardActions>; run: (operation: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const input = useRef<HTMLInputElement>(null);
  const renameFromMenu = useRef(false);
  const saving = useRef(false);
  const cards = useMemo(() => rows?.filter((card) => card.status === "ACTIVE") ?? [], [rows]);
  const cardIds = useMemo(() => cards.map((card) => cardDragId(card.id)), [cards]);
  const index = lists.findIndex((item) => item.id === list.id);
  const reduced = useReducedBoardMotion();
  const sortable = useSortable({ id: listDragId(list.id), data: { kind: "list", id: list.id }, disabled: { draggable: editing }, transition: { duration: reduced ? 0 : 220, easing: "cubic-bezier(0.2,0.8,0.2,1)" } });
  const drop = useDroppable({ id: listDropId(list.id), data: { kind: "container", listId: list.id }, disabled: !rows });
  function rename() { setName(list.name); setEditing(true); }
  async function saveName() {
    if (saving.current || !name.trim()) return;
    saving.current = true;
    try { if (await run(() => actions.renameList(list.id, name.trim()))) setEditing(false); }
    finally { saving.current = false; }
  }
  return <div data-list-id={list.id} data-drag-placeholder={sortable.isDragging || undefined}
    style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }} className="board-sortable-list flex h-full max-h-full w-80 max-w-[calc(100vw-2rem)] shrink-0 flex-col rounded-lg">
    <section ref={sortable.setNodeRef} role="region" aria-labelledby={`column-${list.id}-title`} className={`flex min-h-0 max-h-full flex-col rounded-lg border bg-background ${drop.isOver ? "border-ring" : ""}`}>
      <div className="flex min-h-12 items-center gap-2 px-2 py-2">
        <Button ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} type="button" variant="ghost" size="icon" className="size-8 shrink-0 max-sm:size-11 cursor-grab touch-none text-muted-foreground active:cursor-grabbing max-sm:size-11" aria-label={t("board.dragList", { name: list.name })} disabled={editing}><GripVertical className="size-4" /></Button>
        {editing ? <><h2 id={`column-${list.id}-title`} className="sr-only">{list.name}</h2><Input ref={input} aria-label={t("board.listName")} value={name} required autoFocus disabled={actions.pending} className="h-8 min-w-0 bg-card text-sm"
          onChange={(event) => setName(event.target.value)} onBlur={() => { void saveName(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveName(); } if (event.key === "Escape") setEditing(false); }} /></>
          : <h2 id={`column-${list.id}-title`} className="min-w-0 flex-1 break-words text-sm font-medium" onDoubleClick={rename}>{list.name}</h2>}
        <span aria-label={t("board.cardCount", { name: list.name })} className="text-xs text-muted-foreground tabular-nums">{rows ? cards.length : "—"}</span>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0 max-sm:size-11" aria-label={t("board.listOptions", { name: list.name })}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (renameFromMenu.current) { event.preventDefault(); renameFromMenu.current = false; input.current?.focus(); } }}>
            <DropdownMenuItem disabled={actions.pending} onSelect={() => { renameFromMenu.current = true; rename(); }}><Pencil />{t("board.renameList")}</DropdownMenuItem>
            <DropdownMenuItem disabled={actions.pending || index <= 0} onSelect={() => { void run(() => actions.moveList(list.id, lists[index - 1].id)); }}><ArrowLeft />{t("board.moveLeft")}</DropdownMenuItem>
            <DropdownMenuItem disabled={actions.pending || index >= lists.length - 1} onSelect={() => { void run(() => actions.moveList(list.id, lists[index + 1].id)); }}><ArrowRight />{t("board.moveRight")}</DropdownMenuItem>
            <DropdownMenuSeparator /><DropdownMenuItem disabled={actions.pending} onSelect={() => { void run(() => actions.lifecycle("lists", list.id, "archive")); }}><Archive />{t("board.archiveList")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {editing && !name.trim() && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{t("board.listNameRequired")}</p>}
      {query && <div className="px-3"><QueryFeedback query={query} label={t("board.cards")} /></div>}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <ul ref={drop.setNodeRef} className="min-h-12 space-y-2 overflow-y-auto overscroll-contain px-2 pb-2">
          {query?.isSuccess && cards.length === 0 && <li className="px-1 py-4 text-sm text-muted-foreground">{t("board.emptyList")}</li>}
          {cards.map((card) => <BoardCard key={card.id} card={card} boardId={boardId} lists={lists} pending={actions.pending} onMove={(listId) => { void run(() => actions.moveCard(card.id, listId)); }} onArchive={() => { void run(() => actions.lifecycle("cards", card.id, "archive")); }} />)}
        </ul>
      </SortableContext>
      <div className="shrink-0 px-2 pb-2"><CreateCard listId={list.id} onCardCreated={async (id, title) => { await actions.createCard(id, title); }} /></div>
    </section>
  </div>;
}
