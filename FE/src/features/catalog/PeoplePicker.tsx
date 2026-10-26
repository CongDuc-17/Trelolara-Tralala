import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, UserRoundSearch } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import { pageItems, usePeople, usePerson } from "./queries";

function PersonDetails({ id }: { id: string }) {
  const { t } = useTranslation();
  const query = usePerson(id, true);
  return <div className="mt-3 space-y-2 border-t pt-3 text-sm"><QueryFeedback query={query} label={t("people.profileResource")} />{query.data && <><p className="break-words text-muted-foreground">{query.data.bio || t("people.noBio")}</p>{query.data.address && <p className="break-words text-xs text-muted-foreground">{query.data.address}</p>}</>}</div>;
}

export function PeoplePicker({ disabled, onSelect }: { disabled: boolean; onSelect: (email: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const id = useId();
  useEffect(() => { const timer = setTimeout(() => setName(draft.trim()), 300); return () => clearTimeout(timer); }, [draft]);
  const query = usePeople(name, open);
  const people = pageItems(query.data);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant="ghost" size="sm" aria-label={t("people.choose")} title={t("people.choose")} disabled={disabled}><UserRoundSearch className="size-4" /><span className="sm:hidden">{t("people.lookup")}</span><span className="hidden sm:inline">{t("people.choose")}</span></Button></DialogTrigger><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("people.title")}</DialogTitle><DialogDescription>{t("people.description")}</DialogDescription></DialogHeader>
    <div className="space-y-2"><Label htmlFor={id}>{t("people.search")}</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id={id} value={draft} maxLength={100} className="pl-9" onChange={(event) => setDraft(event.target.value)} /></div></div>
    <QueryFeedback query={query} empty={people.length === 0} label={t("people.resource")} />
    <ul className="space-y-2">{people.map((person) => <li key={person.id} className="rounded-xl border p-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><Avatar><AvatarImage src={person.avatar ?? undefined} alt={person.name} /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar><div className="min-w-0 flex-[1_1_10rem]"><p className="break-words text-sm font-medium">{person.name}</p><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{person.email}</p></div><Button type="button" variant="outline" className="h-auto max-w-full whitespace-normal text-left [overflow-wrap:anywhere]" onClick={() => { onSelect(person.email); setOpen(false); }}>{t("people.select", { name: person.name })}</Button></div><Button type="button" variant="link" size="sm" className="mt-1 px-0" aria-expanded={expanded === person.id} onClick={() => setExpanded(expanded === person.id ? null : person.id)}>{t("people.profile")}</Button>{expanded === person.id && <PersonDetails id={person.id} />}</li>)}</ul>
    <LoadMore query={query} label={t("people.resource")} />
  </DialogContent></Dialog>;
}
