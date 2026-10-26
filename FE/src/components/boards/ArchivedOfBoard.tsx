import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { List } from "@/features/boards/types";
import type { CardSummary } from "@/features/cards/types";

export type ArchivePopoverProps = {
  savedCards: CardSummary[]; savedLists: List[]; pending?: boolean; feedback?: ReactNode; isDragOver: boolean;
  dropRef?: React.Ref<HTMLButtonElement>;
  onRestoreCard: (card: CardSummary) => void; onDeleteCard: (card: CardSummary) => Promise<boolean>;
  onRestoreList: (list: List) => void; onDeleteList: (list: List) => Promise<boolean>;
};

export function ArchivePopover({ savedCards, savedLists, pending, feedback, isDragOver, dropRef, onRestoreCard, onDeleteCard, onRestoreList, onDeleteList }: ArchivePopoverProps) {
  const { t } = useTranslation();
  const [deletion, setDeletion] = useState<{ kind: "card"; item: CardSummary } | { kind: "list"; item: List } | null>(null);
  const name = deletion?.kind === "card" ? deletion.item.title : deletion?.item.name;
  async function remove() {
    if (!deletion || pending) return;
    const removed = deletion.kind === "card" ? await onDeleteCard(deletion.item) : await onDeleteList(deletion.item);
    if (removed) setDeletion(null);
  }
  return <><Popover><PopoverTrigger asChild><Button ref={dropRef} variant="outline" aria-label={t("board.archiveItems")} className={isDragOver ? "bg-accent ring-2 ring-ring" : ""}><Archive className="size-4" /><span className="hidden sm:inline">{t("board.archiveItems")}</span><span className="sm:hidden">{t("board.archiveShort")}</span>{savedCards.length + savedLists.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{savedCards.length + savedLists.length}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="max-h-[min(28rem,80dvh)] w-[min(24rem,calc(100vw-2rem))] space-y-3 overflow-y-auto"><h2 className="text-sm font-semibold">{t("board.archiveItems")}</h2>{feedback}
      <Tabs defaultValue="cards"><TabsList className="w-full"><TabsTrigger value="cards">{t("board.archivedCards")} ({savedCards.length})</TabsTrigger><TabsTrigger value="lists">{t("board.archivedLists")} ({savedLists.length})</TabsTrigger></TabsList>
        <TabsContent value="cards" className="space-y-2 pt-2">{savedCards.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("board.emptyCards")}</p>}{savedCards.map((card) => <div key={card.id} className="flex items-center gap-2 rounded-md border p-2"><span className="min-w-0 flex-1 break-words text-sm">{card.title}</span><Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={pending} aria-label={t("board.restoreCard", { name: card.title })} onClick={() => onRestoreCard(card)}><ArchiveRestore className="size-4" /></Button><Button variant="ghost" size="icon" className="size-8 shrink-0 hover:text-destructive" disabled={pending} aria-label={t("board.deleteCard", { name: card.title })} onClick={() => setDeletion({ kind: "card", item: card })}><Trash2 className="size-4" /></Button></div>)}</TabsContent>
        <TabsContent value="lists" className="space-y-2 pt-2">{savedLists.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("board.emptyLists")}</p>}{savedLists.map((list) => <div key={list.id} className="flex items-center gap-2 rounded-md border p-2"><span className="min-w-0 flex-1 break-words text-sm">{list.name}</span><Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={pending} aria-label={t("board.restoreList", { name: list.name })} onClick={() => onRestoreList(list)}><ArchiveRestore className="size-4" /></Button><Button variant="ghost" size="icon" className="size-8 shrink-0 hover:text-destructive" disabled={pending} aria-label={t("board.deleteList", { name: list.name })} onClick={() => setDeletion({ kind: "list", item: list })}><Trash2 className="size-4" /></Button></div>)}</TabsContent>
      </Tabs>
    </PopoverContent>
  </Popover><AlertDialog open={!!deletion} onOpenChange={(open) => { if (!open && !pending) setDeletion(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("board.deleteTitle", { name })}</AlertDialogTitle><AlertDialogDescription>{t("board.deleteDescription")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel><Button variant="destructive" disabled={pending} onClick={() => { void remove(); }}>{t("archive.delete")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
