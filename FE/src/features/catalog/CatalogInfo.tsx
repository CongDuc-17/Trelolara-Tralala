import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/errors";
import { updateBoard, updateProject } from "./api";
import { useInvalidateCatalog } from "./queries";
import type { MemberScope, UpdateCatalogInput } from "./types";

export function CatalogInfo({ kind, id, name, description }: { kind: MemberScope; id: string; name: string; description?: string }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateCatalog();
  const mutation = useMutation({ mutationFn: (value: UpdateCatalogInput) => kind === "projects" ? updateProject(id, value) : updateBoard(id, value), onSuccess: invalidate });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name, description: description ?? "" });
  const [error, setError] = useState("");
  const busy = useRef(false);
  const title = t(kind === "projects" ? "catalogInfo.project" : "catalogInfo.board");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || draft.name.trim().length < 2) return;
    busy.current = true; setError("");
    try { await mutation.mutateAsync({ name: draft.name.trim(), description: draft.description }); setOpen(false); }
    catch (failure) { setError(getApiError(failure).message); }
    finally { busy.current = false; }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) { setOpen(value); if (value) { setDraft({ name, description: description ?? "" }); setError(""); } } }}><DialogTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={title} title={title}><Info className="size-4" /></Button></DialogTrigger><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("catalogInfo.description")}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4" aria-busy={mutation.isPending}>
    <div className="space-y-2"><Label htmlFor={`catalog-name-${id}`}>{t("catalogInfo.name")}</Label><Input id={`catalog-name-${id}`} value={draft.name} required minLength={2} maxLength={100} disabled={mutation.isPending} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`catalog-description-${id}`}>{t("common.description")}</Label><Textarea id={`catalog-description-${id}`} value={draft.description} maxLength={500} disabled={mutation.isPending} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><DialogClose asChild><Button variant="outline" type="button" disabled={mutation.isPending}>{t("common.cancel")}</Button></DialogClose><Button disabled={mutation.isPending || draft.name.trim().length < 2}>{t(mutation.isPending ? "common.saving" : "common.save")}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
