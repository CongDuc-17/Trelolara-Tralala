import { useEffect, useState } from "react";
import { CalendarClock, CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CardBase } from "./types";
import { deadlineState } from "./deadline";

export function DueBadge({ card }: { card: Pick<CardBase, "dueDate" | "isComplete"> }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const state = deadlineState(card, now);
  const date = card.dueDate ? new Date(card.dueDate).toLocaleString(i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return <span className={`inline-flex max-w-full items-center gap-1.5 text-xs leading-5 tabular-nums ${state === "overdue" ? "text-destructive" : state === "soon" ? "text-warning" : state === "complete" ? "text-success" : "text-muted-foreground"}`}>
    {state === "complete" ? <CircleCheck className="size-3.5 shrink-0" /> : <CalendarClock className="size-3.5 shrink-0" />}
    <span className="min-w-0 break-words">{t(`deadline.${state}`)}{date ? ` · ${date}` : ""}</span>
  </span>;
}
