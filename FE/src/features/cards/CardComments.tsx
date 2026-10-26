import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/features/auth/session-context";
import { getApiError } from "@/lib/errors";
import { useCardActions } from "./queries";
import type { CardDetail } from "./types";

export function CardComments({ card, boardId }: { card: CardDetail; boardId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const actions = useCardActions(boardId, card.id);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !content.trim()) return;
    busy.current = true; setError("");
    try { await actions.saveComment(content.trim(), editingId); setContent(""); setEditingId(null); }
    catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <section aria-labelledby="card-comments-title" className="min-w-0 space-y-4 border-t pt-6 md:col-start-1">
    <h2 id="card-comments-title" className="text-base font-semibold">{t("comments.title")}</h2>
    <form onSubmit={save} className="space-y-2">
      <Input ref={input} id="comments" name="comments" aria-label={t(editingId ? "comments.editing" : "comments.title")} placeholder={t("comments.placeholder")} value={content} disabled={actions.pending} onChange={(event) => setContent(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={actions.pending || !content.trim()}>{t(editingId ? "common.update" : "comments.send")}</Button>{editingId && <Button type="button" size="sm" variant="ghost" disabled={actions.pending} onClick={() => { setEditingId(null); setContent(""); }}>{t("common.cancel")}</Button>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
    {card.comments.length === 0 && <p className="text-sm text-muted-foreground">{t("comments.empty")}</p>}
    <ul className="space-y-5">{card.comments.map((comment) => {
      const edited = Date.parse(comment.updatedAt) > Date.parse(comment.createdAt);
      return <li key={comment.id} className="flex min-w-0 gap-3"><Avatar className="size-8 shrink-0"><AvatarImage src={comment.userAvatar ?? undefined} alt={comment.userName} /><AvatarFallback>{comment.userName.charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="break-words text-sm font-medium">{comment.userName}</span><time dateTime={edited ? comment.updatedAt : comment.createdAt} className="text-xs text-muted-foreground">{new Date(edited ? comment.updatedAt : comment.createdAt).toLocaleString(i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN")}{edited ? ` (${t("comments.edited")})` : ""}</time></div>
          <p className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm leading-5">{comment.content}</p>
          {user?.id === comment.userId && <Button type="button" variant="link" size="sm" className="mt-1 h-7 px-0 text-muted-foreground" disabled={actions.pending} aria-label={t("comments.edit")} onClick={() => { setEditingId(comment.id); setContent(comment.content); input.current?.focus(); }}>{t("common.edit")}</Button>}
        </div>
      </li>;
    })}</ul>
  </section>;
}
