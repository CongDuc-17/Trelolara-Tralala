import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiError } from "@/lib/errors";

export function CreateList({ boardId, createList, loading }: { boardId: string; createList: (boardId: string, data: { name: string }) => Promise<unknown>; loading?: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const id = useId();
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !name.trim()) return;
    busy.current = true; setPending(true); setError("");
    try { await createList(boardId, { name: name.trim() }); setName(""); setOpen(false); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; setPending(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant="outline" className="min-h-12 w-full justify-start bg-card text-muted-foreground"><Plus className="size-4" />{t("board.addList")}</Button></DialogTrigger><DialogContent className="sm:max-w-sm"><form onSubmit={create} className="space-y-5"><DialogHeader><DialogTitle>{t("board.newList")}</DialogTitle><DialogDescription>{t("board.newListDescription")}</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor={id}>{t("board.listName")}</Label><Input id={id} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required autoFocus /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={pending}>{t("common.cancel")}</Button></DialogClose><Button type="submit" disabled={loading || pending || !name.trim()}>{t(pending ? "common.creating" : "common.create")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
