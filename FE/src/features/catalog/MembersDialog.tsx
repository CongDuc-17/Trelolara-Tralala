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
import { Copy, Link as LinkIcon, Users, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getApiError } from "@/lib/errors";
import { pageItems, useChangeMemberRole, useCreateShareLink, useInviteMember, useMembers, useRemoveMember, useRoles } from "./queries";
import { LoadMore, QueryFeedback } from "./QueryFeedback";
import type { Invitation, MemberScope } from "./types";
import { PeoplePicker } from "./PeoplePicker";

export function MembersDialog({ kind, id, count }: { kind: MemberScope; id: string; count?: number; }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const members = useMembers(kind, id, true);
  const roles = useRoles(kind, open);
  const invitation = useInviteMember(kind, id);
  const shareLink = useCreateShareLink(kind, id);
  const [mode, setMode] = useState("email");
  const [copied, setCopied] = useState(false);
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
    if (!roleId || (mode === "email" && !email.trim())) { setError(t("membersDialog.required")); return; }
    busy.current = true;
    setPending(true);
    setError("");
    setCopied(false);
    try {
      setResult(mode === "link" ? await shareLink.mutateAsync(roleId) : await invitation.mutateAsync({ email: email.trim(), roleId }));
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
    <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("membersDialog.description")}</DialogDescription></DialogHeader>
      <ToggleGroup type="single" aria-label={t("membersDialog.invitationMethod")} value={mode} onValueChange={(value) => { if (value) { setMode(value); setResult(null); setError(""); setCopied(false); } }} className="w-full bg-muted"><ToggleGroupItem value="email" className="h-11 flex-1 data-[state=on]:bg-card data-[state=on]:ring-1 data-[state=on]:ring-border" disabled={pending}>{t("membersDialog.byEmail")}</ToggleGroupItem><ToggleGroupItem value="link" className="h-11 flex-1 data-[state=on]:bg-card data-[state=on]:ring-1 data-[state=on]:ring-border" disabled={pending}><LinkIcon className="size-4" />{t("membersDialog.byLink")}</ToggleGroupItem></ToggleGroup>
      <form onSubmit={invite} className="space-y-4">
        {mode === "email" ? <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={emailId}>{t("membersDialog.email")}</Label><PeoplePicker disabled={pending} onSelect={(value) => { setEmail(value); setResult(null); }} /></div>
          <Input id={emailId} type="email" required value={email} disabled={pending} onChange={(event) => { setEmail(event.target.value); setResult(null); }} />
        </div> : <p className="text-sm text-muted-foreground">{t("membersDialog.linkHint")}</p>}
        <QueryFeedback query={roles} empty={roles.data?.length === 0} label={t("membersDialog.roles")} />
        <DialogFooter className="grid grid-cols-1 items-center sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Select value={roleId} disabled={pending || !roles.data?.length} onValueChange={(value) => { setRoleId(value); setResult(null); }}>
            <SelectTrigger aria-label={t("membersDialog.invitationRole")} className="w-full min-w-0"><SelectValue placeholder={t("membersDialog.chooseRole")} /></SelectTrigger>
            <SelectContent>{roles.data?.map((role) => <SelectItem key={role.id} value={role.id}>{roleLabel(role.name)}</SelectItem>)}</SelectContent>
          </Select>
          <DialogClose asChild><Button type="button" variant="outline">{t("common.close")}</Button></DialogClose>
          <Button type="submit" disabled={pending || !!result || !roles.data?.length}>{t(pending ? "membersDialog.processing" : mode === "link" ? "membersDialog.createLink" : "membersDialog.invite")}</Button>
        </DialogFooter>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result?.type === "LINK" ? <div className="space-y-2 rounded-lg border p-3">
        <Label htmlFor={`${emailId}-link`}>{t("membersDialog.shareLink")}</Label>
        <Input id={`${emailId}-link`} autoFocus readOnly value={`${window.location.origin}/invite/${kind}/${encodeURIComponent(result.token)}`} onFocus={(event) => event.currentTarget.select()} />
        <p className="text-xs text-muted-foreground">{t("membersDialog.linkExpires", { date: new Date(result.expiresAt).toLocaleString(i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN") })}</p>
        <Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/invite/${kind}/${encodeURIComponent(result.token)}`); setCopied(true); } catch { setError(t("membersDialog.copyFailed")); } }}><Copy className="size-4" />{t(copied ? "membersDialog.copied" : "membersDialog.copy")}</Button>
        {copied && <p role="status" className="text-xs text-success">{t("membersDialog.copied")}</p>}
      </div> : result && <div role="status" className="space-y-2 text-sm">
        <p>{t(result.delivery.email === "SENT" ? "membersDialog.sent" : "membersDialog.emailFailed")}</p>
        {result.delivery.notification === "FAILED" && <p>{t("membersDialog.notificationFailed")}</p>}
        <Button type="button" size="sm" variant="outline" onClick={() => { setResult(null); setEmail(""); setRoleId(""); }}>{t("membersDialog.inviteAnother")}</Button>
      </div>}
      <div className="space-y-2">
        <QueryFeedback query={members} empty={items.length === 0} label={t("membersDialog.resource")} />
        {items.map((member) => <Card key={member.userId} className="member-row grid grid-cols-1 items-center gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="flex min-w-0 items-center gap-3"><Avatar><AvatarImage src={member.avatar ?? ""} alt={member.name} /><AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 space-y-0.5"><div className="break-words font-semibold">{member.name}</div><div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{member.email}</div></div>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2">
            <Select value={member.roleId} onValueChange={(value) => { void changeMember(member.userId, value); }} disabled={pending || !roles.data?.length}>
              <SelectTrigger className="w-full min-w-0" aria-label={t("membersDialog.roleOf", { name: member.name })}><SelectValue placeholder={roleLabel(member.roleName)} /></SelectTrigger>
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
