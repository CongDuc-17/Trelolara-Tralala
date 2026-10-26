import { useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCardActions, useSaveCardLabel } from "@/features/cards/queries";
import type { Label as BoardLabel } from "@/features/cards/types";
import { getApiError } from "@/lib/errors";
import { LabelBadge } from "@/features/cards/LabelBadge";

const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316"]; // taste-skill-ignore: preserve the existing user label palette, separate from interface colours.

export function AddLabel({ labelsBoard, selectedLabels }: { labelsBoard: BoardLabel[]; selectedLabels: BoardLabel[] }) {
  const { t, i18n } = useTranslation();
  const { boardId = "", cardId = "" } = useParams();
  const actions = useCardActions(boardId, cardId);
  const saveLabel = useSaveCardLabel(boardId, cardId);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<BoardLabel | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const id = useId();
  const pending = actions.pending || saveLabel.pending;
  const selected = new Set(selectedLabels.map((label) => label.id));
  const needle = search.trim().toLocaleLowerCase(i18n.resolvedLanguage);
  const filtered = labelsBoard.filter((label) => label.name.toLocaleLowerCase(i18n.resolvedLanguage).includes(needle));
  function start(label: BoardLabel | null) {
    saveLabel.resetCreated(); setEditing(label); setName(label?.name ?? ""); setColor(label?.color ?? ""); setError(""); setEditor(true);
  }
  async function toggle(labelId: string) {
    if (busy.current) return;
    busy.current = true; setError("");
    try { await actions.setLabel(labelId, !selected.has(labelId)); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !name.trim() || !color) return;
    busy.current = true; setError("");
    try { await saveLabel.save({ name: name.trim(), color }, editing); setEditor(false); setName(""); setColor(""); setEditing(null); }
    catch (error) { setError(saveLabel.errorMessage(error)); }
    finally { busy.current = false; }
  }
  return <Popover open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><div className="space-y-2">
    {selectedLabels.length ? <div className="flex flex-wrap gap-1.5">{selectedLabels.map((label) => <LabelBadge key={label.id} label={label} />)}</div> : <p className="text-xs text-muted-foreground">{t("card.noLabels")}</p>}
    <PopoverTrigger asChild><Button variant="outline" size="sm" aria-label={t("cardLabels.trigger")}><Plus className="size-4" />{t("card.labels")}</Button></PopoverTrigger>
  </div>
    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
      {editor ? <form onSubmit={save} className="space-y-4"><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" className="-ml-2 size-8" disabled={pending} aria-label={t("common.cancel")} onClick={() => { setEditor(false); setError(""); }}><ArrowLeft className="size-4" /></Button><h3 className="text-sm font-semibold">{t(editing ? "cardLabels.editTitle" : "cardLabels.create")}</h3></div>
        <fieldset disabled={pending} className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("cardLabels.color")}</legend><div className="flex flex-wrap gap-2">{colors.map((value) => <Button key={value} type="button" variant="outline" size="icon" aria-label={t("cardLabels.chooseColor", { color: value })} aria-pressed={color === value} className={`size-9 border-2 ring-offset-2 ring-offset-popover ${color === value ? "border-foreground ring-2 ring-ring" : "border-transparent"}`} style={{ backgroundColor: value }} onClick={() => setColor(value)} />)}</div></fieldset>
        <div className="space-y-2"><Label htmlFor={`${id}-name`}>{t("cardLabels.name")}</Label><Input id={`${id}-name`} placeholder={t("cardLabels.placeholder")} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} autoFocus /></div>
        {color && <LabelBadge label={{ name: name || t("cardLabels.preview"), color }} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditor(false); setError(""); }}>{t("common.cancel")}</Button><Button type="submit" disabled={pending || !name.trim() || !color}>{t(editing ? "common.update" : "common.create")}</Button></div>
      </form> : <div className="space-y-4"><div className="space-y-2"><h3 className="text-sm font-semibold">{t("cardLabels.title")}</h3><p className="text-sm text-muted-foreground">{t("cardLabels.description")}</p></div><div className="space-y-2"><Label htmlFor={`${id}-search`}>{t("cardLabels.search")}</Label><Input id={`${id}-search`} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="max-h-56 space-y-2 overflow-y-auto">{filtered.length === 0 && <p className="text-sm text-muted-foreground">{t("cardLabels.empty")}</p>}{filtered.map((label) => <div key={label.id} className="flex min-w-0 items-center gap-2"><Checkbox id={`${id}-${label.id}`} checked={selected.has(label.id)} disabled={pending} onCheckedChange={() => { void toggle(label.id); }} /><Label htmlFor={`${id}-${label.id}`} className="min-w-0 flex-1 rounded-md py-2 font-normal"><LabelBadge label={label} /></Label><Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" disabled={pending} aria-label={t("cardLabels.edit", { name: label.name })} onClick={() => start(label)}><Pencil className="size-4" /></Button></div>)}</div>
        <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => start(null)}><Plus className="size-4" />{t("cardLabels.create")}</Button>
      </div>}
    </PopoverContent>
  </Popover>;
}
