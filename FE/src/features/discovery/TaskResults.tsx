import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { useCardActions } from "@/features/cards/queries";
import { DueBadge } from "@/features/cards/DueBadge";
import { LabelBadge } from "@/features/cards/LabelBadge";
import { getApiError } from "@/lib/errors";
import { taskCardPath } from "./filters";
import type { Task } from "./types";

function TaskRow({ task, base, search, onSaved }: { task: Task; base: string; search: string; onSaved: (message: string) => void }) {
  const { t } = useTranslation();
  const actions = useCardActions(task.list.board.id, task.id);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const archived = [task.status, task.list.status, task.list.board.status, task.list.board.project.status].some((status) => status !== "ACTIVE");
  async function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    if (busy.current) return;
    busy.current = true; setError("");
    const button = event.currentTarget;
    const row = button.closest("li");
    const next = row?.nextElementSibling?.querySelector("button") ?? row?.previousElementSibling?.querySelector("button");
    try {
      await actions.update({ isComplete: !task.isComplete });
      onSaved(t(task.isComplete ? "tasks.reopened" : "tasks.completed", { title: task.title }));
      if (!button.isConnected) (next instanceof HTMLElement && next.isConnected ? next : document.getElementById("task-results-title"))?.focus();
    } catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <li className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-md px-1 py-3 transition-colors hover:bg-muted/40 focus-within:bg-muted/40 xl:grid-cols-[2.75rem_minmax(0,1fr)_16rem]">
    <Button variant="outline" size="icon" className={`size-11 rounded-full border-border bg-card shadow-none ${task.isComplete ? "text-success" : "text-muted-foreground"}`} disabled={actions.pending || archived} aria-label={t(task.isComplete ? "tasks.reopenCard" : "tasks.completeCard", { title: task.title })} aria-pressed={task.isComplete} aria-busy={actions.pending} onClick={(event) => { void toggle(event); }}>{actions.pending ? <Spinner aria-hidden="true" /> : task.isComplete ? <Check className="size-4" /> : <span aria-hidden="true" className="size-3.5 rounded-full border border-current" />}</Button>
    <div className="min-w-0 space-y-1.5"><Link id={`task-link-${task.id}`} aria-label={task.title} aria-describedby={`task-source-${task.id}`} className="group/task flex min-h-11 flex-col justify-center gap-1 rounded-sm" to={taskCardPath(base, task.list.board.id, task.id, search)}>
      <span className={`flex items-start justify-between gap-2 text-sm font-medium leading-5 group-hover/task:underline group-hover/task:underline-offset-4 ${task.isComplete ? "text-muted-foreground" : "text-foreground"}`}><span className="min-w-0 break-words">{task.title}</span><ChevronRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /></span>
      <span id={`task-source-${task.id}`} className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"><span className="break-words">{task.list.board.name}</span><ChevronRight aria-hidden="true" className="size-3 shrink-0" /><span className="break-words">{task.list.name}</span>{archived && <Badge variant="secondary" className="ml-1 rounded-sm px-1.5 font-normal">{t("tasks.ARCHIVED")}</Badge>}</span>
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {task.cardLabels.map(({ label }) => <LabelBadge key={label.id} label={label} />)}
      {task.cardMembers.length > 0 && <div className="flex min-w-0 items-center gap-1.5"><AvatarGroup>{task.cardMembers.map(({ user }) => <Avatar key={user.id} className="size-5"><AvatarImage src={user.avatar ?? undefined} alt={user.name} /><AvatarFallback className="text-xs">{user.name.charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar>)}</AvatarGroup><span className="break-words text-xs text-muted-foreground">{task.cardMembers.map(({ user }) => user.name).join(", ")}</span></div>}
      </div>
      <div className="xl:hidden"><DueBadge card={task} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <div className="hidden min-w-0 xl:col-start-3 xl:row-start-1 xl:flex xl:self-center xl:justify-end"><DueBadge card={task} /></div>
  </li>;
}

export function TaskResults({ tasks, base, search, onSaved }: { tasks: Task[]; base: string; search: string; onSaved: (message: string) => void }) {
  return <ul className="divide-y">{tasks.map((task) => <TaskRow key={task.id} task={task} base={base} search={search} onSaved={onSaved} />)}</ul>;
}
