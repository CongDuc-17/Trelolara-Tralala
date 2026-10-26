import type { ReactNode } from "react";
import { Circle, CircleCheck, MessageSquareText, SquareCheck } from "lucide-react";

import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import type { CardSummary } from "@/features/cards/types";
import { LabelBadge } from "@/features/cards/LabelBadge";

export function BoardCardFace({ card, title }: { card: CardSummary; title?: ReactNode }) {
  const { t } = useTranslation();

  const items = card.checklists.flatMap((checklist) => checklist.checklistItems);
  const completed = items.filter((item) => item.completed).length;
  return <div className="flex flex-col gap-3 text-left">
    {card.labels.length > 0 && <div className="flex flex-wrap gap-1.5 pr-7">
      {card.labels.map((label) => <LabelBadge key={label.id} label={label} />)}
    </div>}
    <div className="flex items-start gap-3 pr-7 text-sm leading-5">{title ?? <>{card.isComplete ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" /> : <Circle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}<span className={`min-w-0 break-words ${card.isComplete ? "text-muted-foreground line-through" : ""}`}>{card.title}</span></>}</div>
    <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-3 tabular-nums">
        <span aria-label={t("board.commentCount", { count: card.commentCount })} className="inline-flex items-center gap-1"><MessageSquareText className="size-3.5" />{card.commentCount}</span>
        {items.length > 0 && <span aria-label={t("board.checklistCount", { completed, total: items.length })} className={`inline-flex items-center gap-1 ${completed === items.length ? "text-success" : ""}`}><SquareCheck className="size-3.5" />{completed}/{items.length}</span>}
      </div>
      {card.members.length > 0 && <AvatarGroup className="ml-auto">
        {card.members.map((member) => <Avatar key={member.id} className="size-6"><AvatarImage src={member.userAvatar ?? undefined} alt={member.userName} /><AvatarFallback className="text-xs">{member.userName.charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar>)}
      </AvatarGroup>}
    </div>
  </div>;
}
