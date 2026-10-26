import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { AddChecklist } from "@/components/cards/AddChecklist";
import { AddMember } from "@/components/cards/AddMember";
import { AddLabel } from "@/components/cards/AddLabel";
import type { useBoardLabels } from "@/features/catalog/queries";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { CardEditor } from "./CardEditor";
import { CardChecklist } from "./CardChecklist";
import { CardComments } from "./CardComments";
import { CardSchedule } from "./CardSchedule";
import { CardResources } from "./CardResources";
import type { CardDetail } from "./types";

export function CardDialogBody({ card, boardId, labels }: { card: CardDetail; boardId: string; labels: ReturnType<typeof useBoardLabels> }) {
  const { t } = useTranslation();
  return <div className="grid min-w-0 grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_16rem] md:grid-rows-[auto_auto_1fr]">
          <CardEditor card={card} boardId={boardId} />
          <aside className="card-properties min-w-0 space-y-5 border-y py-5 md:col-start-2 md:row-span-3 md:row-start-1 md:rounded-lg md:border md:bg-muted/40 md:p-4">
            <CardSchedule card={card} boardId={boardId} />
            <section className="space-y-2"><h2 className="text-sm font-medium">{t("card.members")}</h2>{card.members.length > 0 ? <AvatarGroup>{card.members.map((member) => <Avatar key={member.id}><AvatarImage src={member.userAvatar ?? undefined} alt={member.userName} /><AvatarFallback>{member.userName.charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar>)}</AvatarGroup> : <p className="text-xs text-muted-foreground">{t("card.noMembers")}</p>}<AddMember membersCard={card.members} /></section>
            <section className="space-y-2"><h2 className="text-sm font-medium">{t("card.labels")}</h2><AddLabel labelsBoard={labels.data ?? []} selectedLabels={card.labels} />{(labels.isPending || labels.isError) && <QueryFeedback query={labels} label={t("card.labelsResource")} />}</section>
            <AddChecklist />
          </aside>
          <section aria-label={t("checklist.section")} className="min-w-0 space-y-4 md:col-start-1">{card.checklists.length ? card.checklists.map((checklist) => <CardChecklist key={checklist.id} checklist={checklist} boardId={boardId} cardId={card.id} />) : <p className="text-sm text-muted-foreground">{t("checklist.empty")}</p>}</section>
          <CardComments card={card} boardId={boardId} />
          <CardResources cardId={card.id} boardId={boardId} attachmentCount={card.attachmentCount} />
        </div>;
}
