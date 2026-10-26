import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Archive, ImagePlus, MoreHorizontal, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { MembersBoard } from "./MembersBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useChangeCatalogLifecycle, useUpdateBoard, useUploadBoardBackground } from "@/features/catalog/queries";
import { getApiError } from "@/lib/errors";
import { CatalogInfo } from "@/features/catalog/CatalogInfo";

export function HeaderBoard({ boardId, boardName, description, membersCount, onPreviewBackground, archive }: {
  boardId: string; boardName?: string; description?: string; membersCount?: number; onPreviewBackground?: (url: string | null) => void; archive?: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(boardName ?? "");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const renameFromMenu = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const preview = useRef<string | null>(null);
  const update = useUpdateBoard(boardId);
  const lifecycle = useChangeCatalogLifecycle();
  const background = useUploadBoardBackground(boardId);
  useEffect(() => () => { upload.current?.abort(); if (preview.current) URL.revokeObjectURL(preview.current); preview.current = null; }, []);
  function rename() { setName(boardName ?? ""); setEditing(true); setError(""); }
  async function saveName() {
    if (busy.current) return;
    if (!name.trim()) { setError(t("board.nameRequired")); return; }
    busy.current = true; setError("");
    try { await update.mutateAsync({ name: name.trim() }); setEditing(false); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  async function archiveBoard() {
    if (busy.current) return;
    busy.current = true; setError("");
    try { await lifecycle.mutateAsync({ kind: "boards", id: boardId, action: "archive" }); toast.success(t("board.archiveSuccess")); navigate("/dashboard", { replace: true }); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || upload.current) return;
    const controller = new AbortController(); upload.current = controller; setUploading(true);
    const objectUrl = URL.createObjectURL(file); preview.current = objectUrl; onPreviewBackground?.(objectUrl);
    try { toast.info(t("board.uploading")); await background.mutateAsync({ file, signal: controller.signal }); if (!controller.signal.aborted) toast.success(t("board.uploaded")); }
    catch (error) { if (!controller.signal.aborted) toast.error(getApiError(error).message); }
    finally {
      if (!controller.signal.aborted) { onPreviewBackground?.(null); setUploading(false); }
      if (preview.current === objectUrl) { URL.revokeObjectURL(objectUrl); preview.current = null; }
      upload.current = null; if (fileInput.current) fileInput.current.value = "";
    }
  }
  return <header className="board-header shrink-0 space-y-2 border-b bg-frame/95 px-4 py-3 md:px-6">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 w-full items-center gap-2 sm:w-auto sm:flex-[1_1_16rem]">
        {editing ? <><h1 id="board-title" tabIndex={-1} className="sr-only">{boardName}</h1><Input ref={input} autoFocus aria-label={t("board.name")} value={name} disabled={update.isPending} className="h-9 max-w-md text-base font-medium" onChange={(event) => setName(event.target.value)} onBlur={() => { void saveName(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveName(); } if (event.key === "Escape") setEditing(false); }} /></>
          : <><h1 id="board-title" tabIndex={-1} className="min-w-0 break-words text-2xl font-semibold tracking-tight" onDoubleClick={rename}>{boardName}</h1><Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={t("board.rename")} onClick={rename}><Pencil className="size-3.5" /></Button></>}
      </div>
      <div className="flex flex-wrap items-center gap-2 max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11 max-sm:[&_a]:min-h-11">
        <Button variant="outline" size="sm" asChild><Link to={`/boards/${boardId}/search`}><Search className="size-4" />{t("tasks.searchBoard")}</Link></Button>
        {archive}<div className="flex items-center gap-1"><CatalogInfo kind="boards" id={boardId} name={boardName ?? ""} description={description} /><MembersBoard boardId={boardId} count={membersCount} />
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("board.options")}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (confirm) event.preventDefault(); if (renameFromMenu.current) { event.preventDefault(); renameFromMenu.current = false; input.current?.focus(); } }}>
            <DropdownMenuItem onSelect={() => { renameFromMenu.current = true; rename(); }} disabled={update.isPending}><Pencil />{t("board.rename")}</DropdownMenuItem>
            <DropdownMenuItem disabled={uploading} onSelect={() => { fileInput.current?.click(); }}><ImagePlus />{t("board.background")}</DropdownMenuItem>
            <DropdownMenuSeparator /><DropdownMenuItem disabled={lifecycle.isPending} onSelect={() => { setError(""); setConfirm(true); }}><Archive />{t("board.archiveBoard")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu></div>
        <input ref={fileInput} type="file" aria-label={t("board.backgroundFile")} accept="image/*" disabled={uploading} onChange={uploadFile} className="hidden" />
      </div>
    </div>
    {!confirm && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AlertDialog open={confirm} onOpenChange={(open) => { if (!lifecycle.isPending) setConfirm(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("board.archiveTitle", { name: boardName })}</AlertDialogTitle><AlertDialogDescription>{t("board.archiveDescription")}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={lifecycle.isPending}>{t("common.cancel")}</AlertDialogCancel><Button disabled={lifecycle.isPending} onClick={() => { void archiveBoard(); }}>{t("board.archiveBoard")}</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </header>;
}
