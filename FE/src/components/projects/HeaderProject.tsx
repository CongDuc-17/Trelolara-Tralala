import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Archive, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MembersProject } from "./MembersProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChangeCatalogLifecycle, useUpdateProject } from "@/features/catalog/queries";
import { getApiError } from "@/lib/errors";
import { CatalogInfo } from "@/features/catalog/CatalogInfo";

export function HeaderProject({ projectId, projectName, description, status, membersCount, isLoading }: { projectId: string; projectName?: string; description?: string; status?: string; membersCount?: number; isLoading?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const update = useUpdateProject(projectId);
  const lifecycle = useChangeCatalogLifecycle();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName ?? "");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const busy = useRef(false);
  const edited = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const fromMenu = useRef(false);
  const pending = update.isPending || lifecycle.isPending;
  useEffect(() => { if (editing) input.current?.focus(); else if (edited.current) renameButton.current?.focus(); }, [editing]);
  function rename() { edited.current = true; setName(projectName ?? ""); setError(""); setEditing(true); }
  function cancel() { setEditing(false); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (!name.trim()) { setError(t("projects.requiredName")); return; }
    if (name.trim() === projectName) { cancel(); return; }
    busy.current = true; setError("");
    try { await update.mutateAsync({ name: name.trim() }); setEditing(false); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  async function archive() {
    if (busy.current) return;
    busy.current = true; setError("");
    try { await lifecycle.mutateAsync({ kind: "projects", id: projectId, action: "archive" }); toast.success(t("projects.archiveSuccess")); navigate("/dashboard", { replace: true }); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  if (isLoading) return <header role="status" aria-label={t("common.loadingResource", { label: t("common.project") })} className="space-y-3"><div className="flex items-center justify-between gap-4"><Skeleton className="h-8 w-56 max-w-full" /><Skeleton className="h-11 w-20 shrink-0" /></div><Skeleton className="h-5 w-2/3" /></header>;
  return <header className="space-y-3">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
      {["ACTIVE", "ARCHIVED"].includes(status ?? "") && <p className="col-start-1 row-start-1 flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${status === "ACTIVE" ? "bg-success" : "bg-muted-foreground"}`} />{t(status === "ACTIVE" ? "projects.active" : "projects.archived")}</p>}
      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1">
        {editing ? <><h1 className="sr-only">{projectName}</h1><form onSubmit={save} aria-busy={pending} className="flex flex-wrap items-center gap-2"><Input ref={input} aria-label={t("projects.name")} value={name} disabled={pending} className="h-11 w-full sm:w-64" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); cancel(); } }} /><Button className="h-11" type="submit" disabled={pending}>{t(pending ? "common.saving" : "common.save")}</Button><Button className="h-11" type="button" variant="outline" disabled={pending} onClick={cancel}>{t("common.cancel")}</Button></form></>
          : <div className="flex min-w-0 items-center gap-2"><h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight" onDoubleClick={rename}>{projectName}</h1><Button ref={renameButton} variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={t("projects.rename")} disabled={pending} onClick={rename}><Pencil className="size-4" /></Button></div>}
      </div>
      <div className="col-start-2 row-start-1 flex items-center gap-2 sm:row-span-2"><CatalogInfo kind="projects" id={projectId} name={projectName ?? ""} description={description} /><MembersProject projectId={projectId} count={membersCount} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" disabled={pending} aria-label={t("projects.options")}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (confirm) event.preventDefault(); if (fromMenu.current) { event.preventDefault(); fromMenu.current = false; input.current?.focus(); } }}><DropdownMenuItem onSelect={() => { fromMenu.current = true; rename(); }}><Pencil />{t("projects.rename")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { setError(""); setConfirm(true); }}><Archive />{t("projects.archive")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </div>
    {description?.trim() && <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{description}</p>}
    {!confirm && error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <AlertDialog open={confirm} onOpenChange={(open) => { if (!pending) setConfirm(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("projects.archiveTitle", { name: projectName })}</AlertDialogTitle><AlertDialogDescription>{t("projects.archiveDescription")}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel className="h-11" disabled={pending}>{t("common.cancel")}</AlertDialogCancel><Button className="h-11" disabled={pending} onClick={() => { void archive(); }}>{t(pending ? "projects.archiving" : "projects.archive")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </header>;
}
