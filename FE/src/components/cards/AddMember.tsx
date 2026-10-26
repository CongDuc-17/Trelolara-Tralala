import { useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pageItems, useMembers } from "@/features/catalog/queries";
import { QueryFeedback } from "@/features/catalog/QueryFeedback";
import { useCardActions } from "@/features/cards/queries";
import type { CardMember } from "@/features/cards/types";
import { getApiError } from "@/lib/errors";

export function AddMember({ membersCard = [] }: { membersCard: CardMember[] }) {
  const { t, i18n } = useTranslation();
  const { boardId = "", cardId = "" } = useParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const members = useMembers("boards", boardId, open);
  const actions = useCardActions(boardId, cardId);
  const busy = useRef(false);
  const id = useId();
  const needle = search.trim().toLocaleLowerCase(i18n.resolvedLanguage);
  const assigned = new Set(membersCard.map((member) => member.userId));
  const available = pageItems(members.data).filter((member) => !assigned.has(member.userId) && `${member.name} ${member.email}`.toLocaleLowerCase(i18n.resolvedLanguage).includes(needle));
  async function change(userId: string, remove = false) {
    if (busy.current) return;
    busy.current = true; setError("");
    try { if (remove) await actions.removeMember(userId); else await actions.addMember(userId); }
    catch (error) { setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" aria-label={t("cardMembers.trigger")}><UserPlus className="size-4" />{t("card.members")}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]"><div className="space-y-4"><div className="space-y-2"><h3 className="text-sm font-semibold">{t("cardMembers.title")}</h3><p className="text-sm text-muted-foreground">{t("cardMembers.description")}</p></div><div className="space-y-2"><Label htmlFor={id}>{t("cardMembers.search")}</Label><Input id={id} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="max-h-64 space-y-3 overflow-y-auto"><h4 className="text-xs font-medium text-muted-foreground">{t("cardMembers.assigned")}</h4>
        {membersCard.filter((member) => member.userName.toLocaleLowerCase(i18n.resolvedLanguage).includes(needle)).map((member) => <div key={member.userId} className="flex min-w-0 items-center gap-2 rounded-md border p-2"><Avatar className="size-7 shrink-0"><AvatarImage src={member.userAvatar ?? undefined} alt={member.userName} /><AvatarFallback>{member.userName.charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 flex-1 break-words text-sm">{member.userName}</span><Button variant="ghost" size="icon" className="size-8 shrink-0 hover:text-destructive" disabled={actions.pending} aria-label={t("cardMembers.remove", { name: member.userName })} onClick={() => { void change(member.userId, true); }}><X className="size-4" /></Button></div>)}
        <h4 className="text-xs font-medium text-muted-foreground">{t("cardMembers.available")}</h4><QueryFeedback query={members} label={t("cardMembers.resource")} />
        {members.isSuccess && available.length === 0 && <p className="text-sm text-muted-foreground">{t("cardMembers.empty")}</p>}
        {available.map((member) => <Button key={member.userId} aria-label={member.name} variant="ghost" className="h-auto w-full justify-start whitespace-normal p-2 text-left" disabled={actions.pending} onClick={() => { void change(member.userId); }}><Avatar className="size-7 shrink-0"><AvatarImage src={member.avatar ?? undefined} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 break-words"><span className="block">{member.name}</span><span className="block break-all text-xs font-normal text-muted-foreground">{member.email}</span></span></Button>)}
      </div>
    </div></PopoverContent>
  </Popover>;
}
