import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LoadMore, QueryFeedback } from "@/features/catalog/QueryFeedback";
import { pageItems, useBoardLabels, useMembers } from "@/features/catalog/queries";
import { taskParams } from "./filters";
import type { Task, TaskFilters as Filters } from "./types";

function CompletionFilter({ filters, change }: { filters: Filters; change: (next: Partial<Filters>) => void }) {
  const { t } = useTranslation();
  return <Select value={filters.isComplete === undefined ? "all" : String(filters.isComplete)} onValueChange={(value) => change({ isComplete: value === "all" ? undefined : value === "true" })}><SelectTrigger className="h-11 min-w-36 sm:h-10" aria-label={t("tasks.completion")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("tasks.allCompletion")}</SelectItem><SelectItem value="false">{t("tasks.incomplete")}</SelectItem><SelectItem value="true">{t("tasks.complete")}</SelectItem></SelectContent></Select>;
}

export function TaskFilters({ filters, boardId, tasks }: { filters: Filters; boardId?: string; tasks: Task[] }) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const currentKeyword = filters.keyword ?? "";
  const [draft, setDraft] = useState({ source: currentKeyword, value: currentKeyword });
  const keyword = draft.source === currentKeyword ? draft.value : currentKeyword;
  if (draft.source !== currentKeyword) setDraft({ source: currentKeyword, value: currentKeyword });
  const [open, setOpen] = useState(false);
  const members = useMembers("boards", boardId ?? "", !!boardId && open);
  const labels = useBoardLabels(boardId ?? "");
  const memberOptions = boardId ? pageItems(members.data).map((member) => ({ id: member.userId, name: member.name })) : [...new Map(tasks.flatMap((task) => task.cardMembers.map(({ user }) => [user.id, user] as const))).values()];
  const labelOptions = boardId ? labels.data ?? [] : [...new Map(tasks.flatMap((task) => task.cardLabels.map(({ label }) => [label.id, label] as const))).values()];
  useEffect(() => {
    if (keyword.trim() === (filters.keyword ?? "")) return;
    const timer = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (keyword.trim()) next.set("keyword", keyword.trim()); else next.delete("keyword");
        next.delete("cursor");
        return next;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, filters.keyword, setParams]);
  function change(next: Partial<Filters>) { setParams(taskParams({ ...filters, ...next })); }
  function toggle(key: "memberIds" | "labelIds", id: string) {
    const ids = filters[key] ?? [];
    const next = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
    change({ [key]: next.length ? next : undefined });
  }
  const advancedCount = (filters.memberIds?.length ?? 0) + (filters.labelIds?.length ?? 0) + Number(filters.status !== undefined && filters.status !== "ACTIVE") + Number(filters.isComplete !== undefined);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 sm:top-3 text-muted-foreground" /><Input type="search" aria-label={t("tasks.keyword")} placeholder={t("tasks.keyword")} maxLength={100} value={keyword} onChange={(event) => setDraft({ source: currentKeyword, value: event.target.value })} className="h-11 pl-9 sm:h-10" /></div>
      <div className="hidden sm:block"><CompletionFilter filters={filters} change={change} /></div>
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" className="h-11 sm:h-10" aria-label={t("tasks.filters")}><SlidersHorizontal className="size-4" /><span className="hidden sm:inline">{t("tasks.filters")}</span>{advancedCount > 0 && <span className="tabular-nums">{advancedCount}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(36rem,75dvh)] overflow-y-auto space-y-4">
        <div><h2 className="text-sm font-semibold">{t("tasks.filters")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("tasks.filterLogic")}</p></div>
        <div className="sm:hidden"><CompletionFilter filters={filters} change={change} /></div>
        {boardId && <div className="space-y-2"><Label htmlFor="task-status">{t("tasks.lifecycle")}</Label><Select value={filters.status ?? "ACTIVE"} onValueChange={(value) => change({ status: value as Filters["status"] })}><SelectTrigger id="task-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["ACTIVE", "ARCHIVED", "ALL"].map((value) => <SelectItem key={value} value={value}>{t(`tasks.${value}`)}</SelectItem>)}</SelectContent></Select></div>}
        {!boardId && <p className="text-xs text-muted-foreground">{t("tasks.loadedOptions")}</p>}
        {([{ key: "memberIds", title: "tasks.members", options: memberOptions }, { key: "labelIds", title: "tasks.labels", options: labelOptions }] as const).map(({ key, title, options }) => {
          const selected = filters[key] ?? [];
          const all = [...options, ...selected.filter((id) => !options.some((option) => option.id === id)).map((id, index) => ({ id, name: t(key === "memberIds" ? "tasks.selectedMember" : "tasks.selectedLabel", { number: index + 1 }) }))];
          return <fieldset key={key} className="space-y-1"><legend className="mb-1 text-sm font-medium">{t(title)}</legend>
            {all.map((option) => <Label key={option.id} className="flex min-h-10 items-center gap-2 break-words py-1 font-normal"><Checkbox checked={selected.includes(option.id)} disabled={selected.length >= 50 && !selected.includes(option.id)} onCheckedChange={() => toggle(key, option.id)} /><span className="min-w-0">{option.name}</span></Label>)}
            {all.length === 0 && <p className="text-xs text-muted-foreground">{t("tasks.noOptions")}</p>}
            {boardId && (key === "memberIds" ? <><QueryFeedback query={members} label={t(title)} /><LoadMore query={members} label={t(title)} /></> : <QueryFeedback query={labels} label={t(title)} />)}
          </fieldset>;
        })}
      </PopoverContent></Popover>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><ToggleGroup type="single" size="sm" spacing={1} value={filters.due ?? "all"} onValueChange={(due) => { if (due) change({ due: due === "all" ? undefined : due as Filters["due"] }); }} aria-label={t("tasks.dueFilter")} className="max-w-full overflow-x-auto rounded-md border p-1">{["all", "overdue", "soon", "none"].map((due) => <ToggleGroupItem key={due} value={due} className="h-11 rounded-sm px-1 text-xs sm:h-8 sm:px-3">{t(`tasks.due_${due}`)}</ToggleGroupItem>)}</ToggleGroup>
      {Object.keys(filters).length > 0 && <Button size="sm" variant="ghost" className="h-11 text-muted-foreground sm:h-8" onClick={() => setParams({})}><X className="size-3.5" />{t("tasks.clearFilters")}</Button>}
    </div>
  </div>;
}
