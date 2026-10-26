import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/errors";
import { useCardActions } from "./queries";
import type { CardDetail } from "./types";

export function CardEditor({ card, boardId }: { card: CardDetail; boardId: string }) {
  const { t } = useTranslation();
  const actions = useCardActions(boardId, card.id);
  const [draft, setDraft] = useState<{ title?: string; description?: string }>({});
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !Object.keys(draft).length) return;
    if (draft.title !== undefined && !draft.title.trim()) { setError(t("card.nameRequired")); return; }
    busy.current = true; setError("");
    try {
      await actions.update({ ...(draft.title !== undefined ? { title: draft.title.trim() } : {}), ...(draft.description !== undefined ? { description: draft.description || null } : {}) });
      setDraft({});
    } catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <section aria-label={t("card.content")} className="min-w-0 md:col-start-1 md:row-start-1">
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="card-title">{t("card.name")}</Label><Input id="card-title" value={draft.title ?? card.title} maxLength={100} required disabled={actions.pending} onChange={(event) => setDraft((draft) => ({ ...draft, title: event.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="description">{t("common.description")}</Label><Textarea id="description" name="description" placeholder={t("card.descriptionPlaceholder")} className="min-h-28 resize-y" value={draft.description ?? card.description ?? ""} disabled={actions.pending} onChange={(event) => setDraft((draft) => ({ ...draft, description: event.target.value }))} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={actions.pending || !Object.keys(draft).length}>{t(actions.pending ? "common.saving" : "common.save")}</Button>
    </form>
  </section>;
}
