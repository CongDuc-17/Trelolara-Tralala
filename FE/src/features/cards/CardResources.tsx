import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, History, Paperclip, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { getApiError } from "@/lib/errors";
import { getAttachmentDownload } from "./api";
import { useCardActions, useCardActivities, useCardAttachments } from "./queries";
import type { CardAttachment } from "./types";

function Attachments({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { t, i18n } = useTranslation();
  const query = useCardAttachments(boardId, cardId);
  const actions = useCardActions(boardId, cardId);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [deletion, setDeletion] = useState<CardAttachment | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [download, setDownload] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function upload() {
    if (!file || controller.current || actions.pending) return;
    if (!file.size || file.size > 10 * 1024 * 1024 || !/\.(png|jpe?g|webp|pdf)$/i.test(file.name)) { setError(t("attachments.invalid")); return; }
    const abort = new AbortController(); controller.current = abort; setError(""); setSaved(false);
    try { await actions.uploadAttachment(file, abort.signal); setFile(null); if (input.current) input.current.value = ""; setSaved(true); }
    catch (failure) { if (getApiError(failure).kind !== "canceled") setError(getApiError(failure).message); }
    finally { controller.current = null; }
  }
  async function remove() {
    if (!deletion || actions.pending) return;
    setError(""); setSaved(false);
    try { await actions.deleteAttachment(deletion.id); setDeletion(null); }
    catch (failure) { setError(getApiError(failure).message); }
  }
  async function openFile(id: string) {
    if (downloading) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setDownloading(id); setError("");
    try {
      const url = await getAttachmentDownload(cardId, id);
      if (popup && !popup.closed) popup.location.replace(url);
      else setDownload({ id, url });
    } catch (failure) { popup?.close(); setError(getApiError(failure).message); }
    finally { setDownloading(null); }
  }
  return <div className="space-y-4 border-t p-4">
    <p id="attachment-hint" className="text-xs text-muted-foreground">{t("attachments.hint")}</p>
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" aria-label={t("attachments.choose")} aria-describedby="attachment-hint" disabled={actions.pending} className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSaved(false); setError(""); }} />
      <Button type="button" variant="outline" disabled={actions.pending} onClick={() => input.current?.click()}><Paperclip className="size-4" />{t("attachments.choose")}</Button>
      {file && <><span className="min-w-0 flex-1 break-words text-xs">{file.name}</span><Button type="button" disabled={actions.pending} onClick={() => { void upload(); }}><Upload className="size-4" />{t(actions.pending ? "attachments.uploading" : "attachments.upload")}</Button></>}
      <Button type="button" variant="ghost" size="icon" aria-label={t("attachments.refresh")} disabled={query.isFetching || actions.pending} onClick={() => { void query.refetch(); }}><RefreshCw className="size-4" /></Button>
    </div>
    {saved && <p role="status" className="text-sm text-success">{t("attachments.saved")}</p>}
    {error && !deletion && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <QueryFeedback query={query} empty={query.data?.length === 0} label={t("attachments.title")} />
    <ul className="divide-y">{query.data?.map((attachment) => <li key={attachment.id} className="flex min-w-0 flex-wrap items-center gap-2 py-3">
      <div className="min-w-0 flex-[1_1_12rem] space-y-1"><p className="break-words text-sm font-medium">{attachment.fileName}</p><p className="text-xs text-muted-foreground">{new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(attachment.fileSize / 1024)} KB · <time dateTime={attachment.createdAt}>{new Date(attachment.createdAt).toLocaleDateString(i18n.resolvedLanguage)}</time></p></div>
      <Button type="button" variant="ghost" size="icon" disabled={!attachment.downloadUrl || downloading !== null} aria-label={t("attachments.download", { name: attachment.fileName })} onClick={() => { void openFile(attachment.id); }}><Download className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" disabled={actions.pending} aria-label={t("attachments.delete", { name: attachment.fileName })} onClick={() => { setError(""); setDeletion(attachment); }}><Trash2 className="size-4" /></Button>
      {!attachment.downloadUrl && <p className="basis-full text-xs text-muted-foreground">{t("attachments.unavailable")}</p>}
      {download?.id === attachment.id && <a href={download.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 basis-full items-center text-sm underline">{t("attachments.continueDownload")}</a>}
    </li>)}</ul>
    <AlertDialog open={!!deletion} onOpenChange={(open) => { if (!actions.pending && !open) { setDeletion(null); setError(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("attachments.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("attachments.deleteHint", { name: deletion?.fileName })}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={actions.pending}>{t("common.cancel")}</AlertDialogCancel><Button variant="destructive" disabled={actions.pending} onClick={() => { void remove(); }}>{t("common.delete")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Activities({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { t, i18n } = useTranslation();
  const query = useCardActivities(boardId, cardId);
  const events = [...new Map(query.data?.pages.flatMap((page) => page.items).map((event) => [event.id, event])).values()];
  return <div className="space-y-3 border-t p-4">
    <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{t("activities.description")}</p><Button variant="ghost" size="icon" aria-label={t("activities.refresh")} disabled={query.isFetching} onClick={() => { void query.refetch(); }}><RefreshCw className="size-4" /></Button></div>
    <QueryFeedback query={query} empty={!events.length} label={t("activities.title")} />
    <ol className="space-y-4">{events.map((event) => <li key={event.id} className="flex min-w-0 items-start gap-3"><Avatar className="size-8 shrink-0"><AvatarImage src={event.actor.avatar ?? undefined} alt={event.actor.name} /><AvatarFallback>{event.actor.name.charAt(0)}</AvatarFallback></Avatar><div className="min-w-0 space-y-1"><p className="break-words text-sm"><strong className="font-medium">{event.actor.name}</strong> {t(`activities.actions.${event.action}`, { defaultValue: t("activities.changed") })}</p>{event.details && <p className="break-words text-xs text-muted-foreground">{event.details}</p>}<time dateTime={event.createdAt} className="block text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString(i18n.resolvedLanguage)}</time></div></li>)}</ol>
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{t("activities.more")}</Button>}
  </div>;
}

export function CardResources({ boardId, cardId, attachmentCount }: { boardId: string; cardId: string; attachmentCount: number }) {
  const { t } = useTranslation();
  const [filesOpen, setFilesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const summary = "flex min-h-14 cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden";
  return <section className="min-w-0 space-y-3 md:col-start-1">
    <details className="group rounded-xl border" onToggle={(event) => { if (event.currentTarget.open) setFilesOpen(true); }}><summary className={summary}><Paperclip aria-hidden="true" className="size-4" />{t("attachments.title")}{attachmentCount > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">{attachmentCount}</span>}<ChevronDown className="ml-auto size-4 transition-transform duration-180 group-open:rotate-180 motion-reduce:transition-none" /></summary>{filesOpen && <Attachments boardId={boardId} cardId={cardId} />}</details>
    <details className="group rounded-xl border" onToggle={(event) => { if (event.currentTarget.open) setActivityOpen(true); }}><summary className={summary}><History className="size-4" />{t("activities.title")}<ChevronDown className="ml-auto size-4 group-open:rotate-180" /></summary>{activityOpen && <Activities boardId={boardId} cardId={cardId} />}</details>
  </section>;
}
