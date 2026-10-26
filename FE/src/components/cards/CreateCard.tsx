import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { getApiError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateCard({ listId, onCardCreated }: { listId: string; onCardCreated: (listId: string, title: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  function cancel() { setOpen(false); setTitle(""); setError(""); }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !title.trim()) return;
    busy.current = true; setPending(true); setError("");
    try { await onCardCreated(listId, title); cancel(); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; setPending(false); }
  }
  if (!open) return <Button type="button" variant="ghost" size="sm" className="h-9 w-full justify-start text-muted-foreground" onClick={() => setOpen(true)}><Plus className="size-4" />{t("board.addCard")}</Button>;
  return <form onSubmit={create} className="w-full space-y-2 rounded-md p-1"><Label htmlFor={`new-card-${listId}`}>{t("board.cardTitle")}</Label><Input id={`new-card-${listId}`} placeholder={t("board.cardPlaceholder")} autoFocus value={title} maxLength={100} disabled={pending} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); event.stopPropagation(); cancel(); } }} className="min-w-0 bg-card" />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending || !title.trim()}>{t(pending ? "common.adding" : "common.add")}</Button><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancel}>{t("common.cancel")}</Button></div>
  </form>;
}
