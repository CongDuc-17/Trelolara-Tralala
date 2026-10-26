import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArrowRight, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CardSummary } from "@/features/cards/types";
import { useCardActions } from "@/features/cards/queries";
import { getApiError } from "@/lib/errors";
import type { List } from "./types";
import { cardDragId, useReducedBoardMotion } from "./drag";
import { BoardCardFace } from "./BoardCardFace";

export function BoardCard({ card, boardId, lists, pending, onMove, onArchive }: {
  card: CardSummary; boardId: string; lists: List[]; pending: boolean;
  onMove: (listId: string) => void; onArchive: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actions = useCardActions(boardId, card.id);
  const completion = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const reduced = useReducedBoardMotion();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDragId(card.id), data: { kind: "card", id: card.id, listId: card.listId }, transition: { duration: reduced ? 0 : 180, easing: "cubic-bezier(0.2,0.8,0.2,1)" },
  });
  async function toggleComplete(checked: boolean) {
    if (busy.current || pending || actions.pending) return;
    const hadFocus = document.activeElement === completion.current;
    busy.current = true; setError("");
    try {
      await actions.update({ isComplete: checked });
    } catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally {
      busy.current = false;
      if (hadFocus && document.activeElement === document.body) requestAnimationFrame(() => {
        if (document.activeElement === document.body) completion.current?.focus();
      });
    }
  }
  return <li ref={setNodeRef} data-card-id={card.id} data-drag-placeholder={isDragging || undefined}
    className="board-sortable-card group relative rounded-lg border bg-card text-foreground"
    style={{ transform: CSS.Translate.toString(transform), transition }}>
    <div className="p-3"><BoardCardFace card={card} title={<>
      <Checkbox ref={completion} checked={card.isComplete} disabled={pending || actions.pending} aria-busy={actions.pending} aria-label={t(card.isComplete ? "tasks.reopenCard" : "tasks.completeCard", { title: card.title })}
        className={`relative z-10 size-5 rounded-full border-muted-foreground shadow-none after:absolute after:-inset-3 data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-primary-foreground dark:bg-transparent dark:data-[state=checked]:bg-success ${card.isComplete ? "" : "pointer-events-none -mr-3 w-0 opacity-0 transition-[width,margin,opacity] duration-150 group-hover:pointer-events-auto group-hover:mr-0 group-hover:w-5 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mr-0 group-focus-within:w-5 group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:mr-0 [@media(hover:none)]:w-5 [@media(hover:none)]:opacity-100 motion-reduce:transition-none"}`}
        onCheckedChange={(checked) => { void toggleComplete(checked === true); }} />
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} id={`board-card-${card.id}`} type="button" aria-label={card.title}
        className={`min-w-0 flex-1 cursor-grab touch-pan-y break-words text-left after:absolute after:inset-0 after:rounded-lg active:cursor-grabbing ${card.isComplete ? "text-muted-foreground line-through" : ""}`}
        onClick={() => { if (!isDragging) navigate(`/boards/${boardId}/cards/${card.id}`); }}>{card.title}</button>
    </>} />{error && <p role="alert" className="relative mt-2 text-xs leading-5 text-destructive">{error}</p>}</div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 z-10 size-8 bg-card opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100" aria-label={t("board.cardOptions", { name: card.title })}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuSub><DropdownMenuSubTrigger disabled={pending}><ArrowRight className="mr-2 size-4" />{t("board.moveTo")}</DropdownMenuSubTrigger><DropdownMenuSubContent>
        {lists.filter((list) => list.id !== card.listId).map((list) => <DropdownMenuItem key={list.id} onSelect={() => onMove(list.id)}>{list.name}</DropdownMenuItem>)}
        {lists.length < 2 && <DropdownMenuItem disabled>{t("board.noOtherList")}</DropdownMenuItem>}
      </DropdownMenuSubContent></DropdownMenuSub><DropdownMenuSeparator /><DropdownMenuItem disabled={pending} onSelect={onArchive}><Archive />{t("board.archiveCard")}</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
  </li>;
}
