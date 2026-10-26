import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { enUS, vi } from "react-day-picker/locale";
import { RefreshCw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskSearch } from "@/features/discovery/queries";
import { getApiError } from "@/lib/errors";

export function TaskSchedule({ enabled }: { enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => new Date());
  const [month, setMonth] = useState(selected);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (!enabled) return; const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, [enabled]);
  const query = useTaskSearch({ isComplete: false }, undefined, enabled);
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN";
  const denied = ["forbidden", "unauthorized", "not-found"].includes(getApiError(query.error).kind);
  const tasks = denied ? [] : [...new Map(query.data?.pages.flatMap((page) => page.items.map((task) => [task.id, task] as const))).values()].filter((task) => task.dueDate && !task.isComplete);
  const dayKey = (date: Date) => date.toLocaleDateString("en-CA");
  const dueByDay = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const key = dayKey(new Date(task.dueDate!));
    dueByDay.set(key, [...(dueByDay.get(key) ?? []), task]);
  }
  const dueOn = (date: Date) => dueByDay.get(dayKey(date)) ?? [];
  const agenda = dueOn(selected).sort((a, b) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!));
  const failedCursor = query.isError && getApiError(query.error).status === 422;
  function today() { const date = new Date(); setSelected(date); setMonth(date); }

  return <section aria-labelledby="schedule-title" className="space-y-4" aria-busy={query.isFetching}>
    <Card className="gap-0 space-y-2 rounded-2xl bg-muted p-3 dark:bg-background">
    <p className="sr-only">{t("schedule.description")}</p>
    <Calendar mode="single" required selected={selected} onSelect={setSelected} month={month} onMonthChange={setMonth}
      className="[&_button[data-day]]:rounded-full"
      classNames={{ nav: "absolute right-0 top-0 flex gap-1", month_caption: "flex h-8 items-center pr-20", button_previous: "inline-flex size-8 items-center justify-center rounded-full bg-background/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", button_next: "inline-flex size-8 items-center justify-center rounded-full bg-background/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", today: "rounded-full ring-1 ring-inset ring-border" }}
      locale={i18n.resolvedLanguage === "en" ? enUS : vi} weekStartsOn={1}
      modifiers={{ task: (date) => dueOn(date).length > 0 }} modifiersClassNames={{ task: "calendar-has-task" }}
      labels={{ labelNext: () => t("schedule.nextMonth"), labelPrevious: () => t("schedule.previousMonth"), labelDayButton: (date) => `${date.toLocaleDateString(locale, { dateStyle: "full" })}${dueOn(date).length ? `, ${t("schedule.dueCount", { count: dueOn(date).length })}` : ""}` }} />
    <div className="flex items-center justify-between gap-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />{t("schedule.legend")}</p>
      <Button size="sm" variant="ghost" className="min-h-11 px-2 text-xs" onClick={today}>{t("schedule.today")}</Button>
      <Button size="icon" variant="ghost" className="size-11 shrink-0" disabled={query.isFetching} aria-label={t("schedule.refresh")} onClick={() => { void query.restart(); }}><RefreshCw className="size-3.5" /></Button>
    </div>
    </Card>
    <div className="flex items-center justify-between gap-2">
      <h2 id="schedule-title" className="text-sm font-semibold">{t("schedule.title")}</h2>
      <Link to="/my-work" className="inline-flex min-h-11 shrink-0 items-center rounded-md text-xs text-muted-foreground hover:text-foreground hover:underline">{t("schedule.all")}</Link>
    </div>
    {query.isPending ? <div role="status" aria-label={t("common.loadingResource", { label: t("tasks.results").toLowerCase() })} className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-12 w-full" /></div> : <>
      {query.isError && <div className="space-y-2"><p role="alert" className="text-sm">{t(failedCursor ? "tasks.cursorExpired" : "tasks.loadError")}</p><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { if (query.isFetchNextPageError && !failedCursor) void query.fetchNextPage(); else void query.restart(); }}>{t("common.retry")}</Button></div>}
      {!denied && query.data && <div className="space-y-3">
        <h3 className="text-xs text-muted-foreground">{selected.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long" })}<span className="ml-2 tabular-nums">{t("schedule.count", { count: agenda.length })}</span></h3>
        <div aria-live="polite">{agenda.length ? <ul className="space-y-2">{agenda.map((task) => <li key={task.id}><Link className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent dark:bg-background" to={`/my-work/boards/${task.list.board.id}/cards/${task.id}`}>
          <div className="min-w-0 flex-1 space-y-1"><p className="break-words text-sm font-medium">{task.title}</p><p className="truncate text-xs text-muted-foreground">{task.list.board.name}</p></div>
          <p className={`shrink-0 text-right text-xs tabular-nums ${Date.parse(task.dueDate!) < now ? "text-destructive" : "text-muted-foreground"}`}><time dateTime={task.dueDate!}>{new Date(task.dueDate!).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time>{Date.parse(task.dueDate!) < now && <span className="mt-1 block">{t("deadline.overdue")}</span>}</p>
        </Link></li>)}</ul> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground dark:bg-background">{t(query.hasNextPage ? "schedule.emptyLoaded" : "schedule.empty")}</p>}</div>
      </div>}
      {query.hasNextPage && <div className="space-y-2"><p className="text-xs text-muted-foreground">{t("schedule.partial")}</p><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{t("tasks.loadMore")}</Button></div>}
    </>}
  </section>;
}
