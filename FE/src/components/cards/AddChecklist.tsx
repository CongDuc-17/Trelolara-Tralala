import { useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCardActions } from "@/features/cards/queries";
import { getApiError } from "@/lib/errors";

export function AddChecklist() {
  const { t } = useTranslation();
  const { boardId = "", cardId = "" } = useParams();
  const actions = useCardActions(boardId, cardId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const id = useId();
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !title.trim()) return;
    busy.current = true; setError("");
    try { await actions.createChecklist(title.trim()); setTitle(""); setOpen(false); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><ListChecks className="size-4" />{t("checklist.add")}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]"><form onSubmit={add} className="space-y-4"><div className="space-y-2"><h3 className="text-sm font-semibold">{t("checklist.add")}</h3><p className="text-sm text-muted-foreground">{t("checklist.description")}</p></div><div className="space-y-2"><Label htmlFor={id}>{t("checklist.title")}</Label><Input id={id} value={title} disabled={actions.pending} onChange={(event) => setTitle(event.target.value)} autoFocus /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={actions.pending} onClick={() => { setOpen(false); setTitle(""); }}>{t("common.cancel")}</Button><Button type="submit" disabled={actions.pending || !title.trim()}>{t(actions.pending ? "common.adding" : "common.add")}</Button></div>
    </form></PopoverContent>
  </Popover>;
}
