import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getApiError } from "@/lib/errors";
import { useCardActions } from "./queries";
import type { Checklist } from "./types";

export function CardChecklist({ checklist, boardId, cardId }: { checklist: Checklist; boardId: string; cardId: string }) {
  const { t } = useTranslation();
  const actions = useCardActions(boardId, cardId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<{ kind: "checklist" | "item"; id: string; title: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; title: string } | null>(null);
  const busy = useRef(false);
  const completed = checklist.checklistItems.filter((item) => item.completed).length;
  const total = checklist.checklistItems.length;
  async function perform(operation: () => Promise<unknown>) {
    if (busy.current) return false;
    busy.current = true; setError("");
    try { await operation(); return true; }
    catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); return false; }
    finally { busy.current = false; }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim() && await perform(() => actions.createChecklistItem(checklist.id, title.trim()))) { setTitle(""); setAdding(false); }
  }
  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (editing?.title.trim() && await perform(() => editing.kind === "checklist" ? actions.updateChecklistTitle(editing.id, editing.title.trim()) : actions.updateChecklistItemTitle(editing.id, editing.title.trim()))) setEditing(null);
  }
  return <Card role="region" className="min-w-0 gap-0 space-y-3 p-4" aria-labelledby={`checklist-${checklist.id}`}>
    <div className="flex items-center justify-between gap-2"><h3 id={`checklist-${checklist.id}`} className="min-w-0 break-words text-sm font-semibold">{checklist.title}</h3><div className="flex shrink-0"><Button variant="ghost" size="icon" disabled={actions.pending} aria-label={t("checklist.rename", { name: checklist.title })} onClick={() => { setEditing({ kind: "checklist", id: checklist.id, title: checklist.title }); setError(""); }}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={actions.pending} aria-label={t("checklist.delete", { name: checklist.title })} onClick={() => { setError(""); setConfirm(true); }}><Trash2 className="size-4" /></Button></div></div>
    {editing && <form onSubmit={saveEdit} className="space-y-2"><Label htmlFor={`edit-checklist-${checklist.id}`}>{t(editing.kind === "item" ? "checklist.editItem" : "checklist.editTitle")}</Label><Input id={`edit-checklist-${checklist.id}`} autoFocus required maxLength={255} value={editing.title} disabled={actions.pending} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />{error && !confirm && !deletingItem && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={actions.pending || !editing.title.trim()}>{t("common.save")}</Button><Button type="button" variant="outline" disabled={actions.pending} onClick={() => { setEditing(null); setError(""); }}>{t("common.cancel")}</Button></div></form>}
    <div className="flex items-center gap-3"><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("checklist.progress", { completed, total })}</span><Progress aria-label={t("checklist.progress", { completed, total })} value={total ? Math.round(completed / total * 100) : 0} className="h-1.5" /></div>
    <ul className="space-y-1">{checklist.checklistItems.map((item) => <li key={item.id} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1">
      <Checkbox id={`checklist-item-${item.id}`} aria-label={t("checklist.completed", { name: item.title })} className="shrink-0" disabled={actions.pending} checked={item.completed} onCheckedChange={(checked) => { void perform(() => actions.setChecklistItemCompletion(item.id, checked === true)); }} />
      <Label htmlFor={`checklist-item-${item.id}`} className={`min-w-0 break-words text-sm font-normal leading-5 ${item.completed ? "text-muted-foreground line-through" : ""}`}>{item.title}</Label>
      <div className="flex"><Button variant="ghost" size="icon" disabled={actions.pending} aria-label={t("checklist.renameItem", { name: item.title })} onClick={() => { setEditing({ kind: "item", id: item.id, title: item.title }); setError(""); }}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" disabled={actions.pending} aria-label={t("checklist.deleteItem", { name: item.title })} onClick={() => { setDeletingItem(item); setError(""); }}><Trash2 className="size-3.5" /></Button></div>
    </li>)}</ul>
    {!confirm && !deletingItem && !editing && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {adding ? <form onSubmit={add} className="space-y-2"><Label htmlFor={`new-item-${checklist.id}`}>{t("checklist.item")}</Label><Input id={`new-item-${checklist.id}`} placeholder={t("checklist.placeholder")} value={title} disabled={actions.pending} onChange={(event) => setTitle(event.target.value)} autoFocus /><div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={actions.pending || !title.trim()}>{t(actions.pending ? "common.adding" : "common.add")}</Button><Button type="button" variant="ghost" size="sm" disabled={actions.pending} onClick={() => { setAdding(false); setTitle(""); }}>{t("common.cancel")}</Button></div></form>
      : <Button variant="outline" size="sm" onClick={() => setAdding(true)}>{t("checklist.addItem")}</Button>}
    <AlertDialog open={confirm || !!deletingItem} onOpenChange={(open) => { if (!actions.pending && !open) { setConfirm(false); setDeletingItem(null); setError(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(deletingItem ? "checklist.deleteItemTitle" : "checklist.deleteTitle", { name: deletingItem?.title ?? checklist.title })}</AlertDialogTitle><AlertDialogDescription>{t(deletingItem ? "checklist.deleteItemDescription" : "checklist.deleteDescription")}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={actions.pending}>{t("common.cancel")}</AlertDialogCancel><Button variant="destructive" disabled={actions.pending} onClick={async () => { if (await perform(() => deletingItem ? actions.deleteChecklistItem(deletingItem.id) : actions.deleteChecklist(checklist.id))) { setConfirm(false); setDeletingItem(null); } }}>{t(deletingItem ? "common.delete" : "checklist.deleteConfirm")}</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </Card>;
}
