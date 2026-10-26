import { useTranslation } from "react-i18next";
import { useId, useRef, useState, type FormEvent } from "react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, X } from "lucide-react";
import { getApiError } from "@/lib/errors";
import { pageItems, useChangeMemberRole, useInviteMember, useMembers, useRemoveMember, useRoles } from "./queries";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import type { Invitation, MemberScope } from "./types";

export function MembersDialog({ kind, id, count }: { kind: MemberScope; id: string; count?: number; }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const members = useMembers(kind, id, true);
  const roles = useRoles(kind, open);
  const invitation = useInviteMember(kind, id);
  const changeRole = useChangeMemberRole(kind, id);
  const remove = useRemoveMember(kind, id);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Invitation | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const emailId = useId();
  const items = pageItems(members.data);
  const total = members.data?.pages[0]?.pagination?.totalItems ?? count ?? items.length;
  const title = t(kind === "projects" ? "membersDialog.project" : "membersDialog.board");
  const roleLabel = (name: string) => { const role = name.replace(/^(PROJECT|BOARD)_/, ""); return t(`membersDialog.rolesMap.${role}`, { defaultValue: role }); };

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (busy.current || result) return;
    if (!email.trim() || !roleId) { setError(t("membersDialog.required")); return; }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      setResult(await invitation.mutateAsync({ email: email.trim(), roleId }));
    } catch (error) {
      setError(getApiError(error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function changeMember(userId: string, newRoleId?: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (newRoleId) await changeRole.mutateAsync({ userId, roleId: newRoleId });
      else await remove.mutateAsync({ userId });
    } catch (error) {
      setError(getApiError(error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="ghost" aria-label={title} aria-describedby={`${emailId}-preview`} title={`${title}${items.length ? `: ${items.slice(0, 3).map((member) => member.name).join(", ")}` : ""}`} className="min-h-11 px-2">
        {members.isPending ? <span aria-hidden="true" className="flex -space-x-2"><Skeleton className="size-8 rounded-full" /><Skeleton className="size-8 rounded-full" /></span> : items.length ? <AvatarGroup>{items.slice(0, 3).map((member) => <Avatar key={member.userId}>
          <AvatarImage src={member.avatar ?? ""} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>)}{total > 3 && <AvatarGroupCount>+{total - Math.min(items.length, 3)}</AvatarGroupCount>}</AvatarGroup> : <><Users className="size-4" /><span className="text-sm">{t("membersDialog.members")}</span></>}
        <span id={`${emailId}-preview`} className="sr-only">{t("common.members", { count: total })}{items.length ? `: ${items.slice(0, 3).map((member) => member.name).join(", ")}` : ""}</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("membersDialog.description")}</DialogDescription></DialogHeader>
      <form onSubmit={invite} className="space-y-4">
        <div className="space-y-2"><Label htmlFor={emailId}>{t("membersDialog.email")}</Label>
          <Input id={emailId} type="email" required value={email} disabled={pending} onChange={(event) => { setEmail(event.target.value); setResult(null); }} />
        </div>
        <QueryFeedback query={roles} empty={roles.data?.length === 0} label={t("membersDialog.roles")} />
        <DialogFooter className="flex-col flex-wrap sm:flex-row">
          <Select value={roleId} disabled={pending || !roles.data?.length} onValueChange={(value) => { setRoleId(value); setResult(null); }}>
            <SelectTrigger aria-label={t("membersDialog.invitationRole")} className="w-[180px]"><SelectValue placeholder={t("membersDialog.chooseRole")} /></SelectTrigger>
            <SelectContent>{roles.data?.map((role) => <SelectItem key={role.id} value={role.id}>{roleLabel(role.name)}</SelectItem>)}</SelectContent>
          </Select>
          <DialogClose asChild><Button type="button" variant="outline">{t("common.close")}</Button></DialogClose>
          <Button type="submit" disabled={pending || !!result || !roles.data?.length}>{t(pending ? "membersDialog.processing" : "membersDialog.invite")}</Button>
        </DialogFooter>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <div role="status" className="space-y-2 text-sm">
        <p>{t(result.delivery.email === "SENT" ? "membersDialog.sent" : "membersDialog.emailFailed")}</p>
        {result.delivery.notification === "FAILED" && <p>{t("membersDialog.notificationFailed")}</p>}
        <Button type="button" size="sm" variant="outline" onClick={() => { setResult(null); setEmail(""); setRoleId(""); }}>{t("membersDialog.inviteAnother")}</Button>
      </div>}
      <div className="max-h-[300px] overflow-y-auto space-y-2">
        <QueryFeedback query={members} empty={items.length === 0} label={t("membersDialog.resource")} />
        {items.map((member) => <Card key={member.userId} className="flex flex-row flex-wrap justify-between items-center gap-4 p-4">
          <div className="flex min-w-0 items-center"><Avatar><AvatarImage src={member.avatar ?? ""} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="ml-3 min-w-0"><div className="font-semibold break-words">{member.name}</div><div className="text-xs text-muted-foreground break-all">{member.email}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={member.roleId} onValueChange={(value) => { void changeMember(member.userId, value); }} disabled={pending || !roles.data?.length}>
              <SelectTrigger className="w-fit" aria-label={t("membersDialog.roleOf", { name: member.name })}><SelectValue placeholder={roleLabel(member.roleName)} /></SelectTrigger>
              <SelectContent>{!roles.data?.some((role) => role.id === member.roleId) && <SelectItem value={member.roleId} disabled>{roleLabel(member.roleName)}</SelectItem>}
                {roles.data?.map((role) => <SelectItem key={role.id} value={role.id}>{roleLabel(role.name)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={t(kind === "projects" ? "membersDialog.removeProject" : "membersDialog.removeBoard", { name: member.name })} onClick={() => { void changeMember(member.userId); }}><X className="text-muted-foreground" /></Button>
          </div>
        </Card>)}
        <LoadMore query={members} label={t("membersDialog.resource")} />
        {kind === "boards" && <p className="text-xs text-muted-foreground">{t("membersDialog.direct")}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
