import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiError } from "@/lib/errors";
import type { CardBase, UpdateCardInput } from "./types";
import { useCardActions } from "./queries";
import { localDeadline, metadataInput } from "./deadline";
import { DueBadge } from "./DueBadge";

export function CardSchedule({ card, boardId }: { card: CardBase; boardId: string }) {
  const { t } = useTranslation();
  const actions = useCardActions(boardId, card.id);
  const [draft, setDraft] = useState<{ dueDate?: string; reminderMinutesBefore?: CardBase["reminderMinutesBefore"] }>({});
  const [error, setError] = useState("");
  const busy = useRef(false);
  const due = draft.dueDate ?? localDeadline(card.dueDate);
  const reminder = draft.reminderMinutesBefore === undefined ? card.reminderMinutesBefore : draft.reminderMinutesBefore;
  async function update(input: UpdateCardInput, clearDraft: boolean) {
    if (busy.current) return;
    busy.current = true; setError("");
    try { await actions.update(input); if (clearDraft) setDraft({}); }
    catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    try { void update(metadataInput(card, draft), true); }
    catch (error) { setError(t(error instanceof Error && error.message === "needsDate" ? "deadline.needsDate" : "deadline.invalidDate")); }
  }
  return <section className="space-y-3" aria-label={t("deadline.title")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">{t("deadline.title")}</h2><Button type="button" size="sm" variant="outline" className="h-11 md:h-8" disabled={actions.pending} onClick={() => { void update({ isComplete: !card.isComplete }, false); }}>{t(card.isComplete ? "deadline.reopen" : "deadline.markComplete")}</Button></div>
    <DueBadge card={card} />
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-2"><Label htmlFor="card-due-date">{t("deadline.date")}</Label><Input type="datetime-local" step={60} id="card-due-date" value={due} disabled={actions.pending} onChange={(event) => setDraft((draft) => ({ ...draft, dueDate: event.target.value }))} aria-describedby="card-timezone" className="h-11 min-w-0 md:h-9" /><p id="card-timezone" className="text-xs text-muted-foreground">{t("deadline.timezone", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p></div>
      {due && <Button type="button" variant="link" size="sm" className="h-11 justify-start p-0 md:h-auto" disabled={actions.pending} onClick={() => setDraft((draft) => ({ ...draft, dueDate: "" }))}>{t("deadline.clear")}</Button>}
      <div className="space-y-2"><Label htmlFor="card-reminder">{t("deadline.reminder")}</Label><Select value={reminder === null ? "off" : String(reminder)} disabled={actions.pending} onValueChange={(value) => setDraft((draft) => ({ ...draft, reminderMinutesBefore: value === "off" ? null : value === "60" ? 60 : 1440 }))}><SelectTrigger id="card-reminder" className="h-11 w-full md:h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">{t("deadline.off")}</SelectItem><SelectItem value="60" disabled={!due}>{t("deadline.hour")}</SelectItem><SelectItem value="1440" disabled={!due}>{t("deadline.day")}</SelectItem></SelectContent></Select></div>
      <p className="text-xs leading-5 text-muted-foreground">{t("deadline.recipients")}</p>
      {reminder !== null && (!due || card.isComplete) && <p role="status" className="text-xs text-muted-foreground">{t(!due ? "deadline.pausedNoDate" : "deadline.pausedComplete")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" size="sm" className="h-11 md:h-8" disabled={actions.pending || !Object.keys(draft).length}>{t(actions.pending ? "common.saving" : "deadline.save")}</Button>{Object.keys(draft).length > 0 && <Button type="button" variant="ghost" size="sm" className="h-11 md:h-8" disabled={actions.pending} onClick={() => { setDraft({}); setError(""); }}>{t("common.cancel")}</Button>}</div>
    </form>
  </section>;
}
