import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DisplayPreferences } from "@/components/layout/DisplayPreferences";
import { ChangePassword } from "@/components/user/ChangePassword";
import { useSession } from "@/features/auth/session-context";
import { useUpdateProfile } from "@/features/profile/queries";
import type { UpdateProfileInput } from "@/features/profile/api";
import { getApiError } from "@/lib/errors";

export function Profile() {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const mutation = useUpdateProfile();
  const [draft, setDraft] = useState<UpdateProfileInput | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const editing = draft !== null;
  const current = draft ?? { name: user?.name ?? "", address: user?.address ?? "", bio: user?.bio ?? "", avatarFile: null };
  const changed = draft !== null && (draft.name !== user?.name || draft.address !== (user?.address ?? "") || draft.bio !== (user?.bio ?? "") || draft.avatarFile !== null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (editing) nameInput.current?.focus(); }, [editing]);
  function change(input: Partial<UpdateProfileInput>) { setDraft({ ...current, ...input }); setSaved(false); }
  function cancel() { setDraft(null); setPreview(null); setError(""); if (fileInput.current) fileInput.current.value = ""; requestAnimationFrame(() => editButton.current?.focus()); }
  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setSaved(false); setError(t("profile.imageLimit")); return; }
    change({ avatarFile: file }); setError(""); setPreview(URL.createObjectURL(file));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy.current) return;
    if (!draft.name.trim()) { setError(t("profile.nameRequired")); return; }
    if ((user?.address?.trim() && !draft.address.trim()) || (user?.bio?.trim() && !draft.bio.trim())) { setError(t("profile.clearUnavailable")); return; }
    busy.current = true; setError("");
    try { await mutation.mutateAsync(draft); cancel(); setSaved(true); }
    catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <div className="w-full min-w-0 space-y-6 p-4 md:p-6">
    <header className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight">{t("nav.profile")}</h1><p className="text-sm text-muted-foreground">{t("profile.personalDescription")}</p></header>
    <div className="flex min-w-0 items-center gap-4">
      <Avatar className="size-14 shrink-0"><AvatarImage src={preview || user?.avatar || undefined} alt={t("profile.avatar")} /><AvatarFallback>{user?.name.charAt(0).toUpperCase() || "?"}</AvatarFallback></Avatar><div className="min-w-0 space-y-1"><h2 className="break-words text-base font-semibold">{user?.name}</h2><p className="flex min-w-0 items-start gap-1.5 break-all text-sm text-muted-foreground"><Mail className="mt-0.5 size-4 shrink-0" />{user?.email}</p>{user?.createdAt && Number.isFinite(Date.parse(user.createdAt)) && <p className="text-xs text-muted-foreground">{t("profile.joined")} {new Date(user.createdAt).toLocaleDateString(i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN")}</p>}</div>
    </div>
    <Tabs defaultValue="personal" className="w-full gap-5"><TabsList variant="line" className="h-11! w-full justify-start border-b [&_button]:h-11 [&_button]:flex-none [&_button]:px-3 sm:[&_button]:px-4"><TabsTrigger value="personal">{t("profile.personal")}</TabsTrigger><TabsTrigger value="security">{t("profile.security")}</TabsTrigger><TabsTrigger value="display">{t("profile.display")}</TabsTrigger></TabsList>
      <TabsContent value="personal" className="max-w-2xl"><form onSubmit={save} className="space-y-5" aria-busy={mutation.isPending}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><h2 className="text-base font-semibold">{t("profile.personalTitle")}</h2><p className="text-xs text-muted-foreground">{t(editing ? "profile.editingHint" : "profile.viewHint")}</p></div>{!editing && <Button ref={editButton} type="button" className="h-11" disabled={mutation.isPending} onClick={() => change({})}>{t("profile.edit")}</Button>}</div>
        <div className={editing ? "flex flex-wrap items-center gap-3" : "hidden"}><Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={() => fileInput.current?.click()}><Camera className="size-4" />{t("profile.changeAvatar")}</Button><span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{draft?.avatarFile?.name ?? t("profile.imageHint")}</span><input type="file" accept="image/*" aria-label={t("profile.avatarFile")} ref={fileInput} disabled={mutation.isPending} onChange={upload} className="hidden" /></div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="profile-name">{t("profile.name")}</Label><Input ref={nameInput} id="profile-name" autoComplete="name" required disabled={!editing || mutation.isPending} className="h-11 disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-100" value={current.name} onChange={(event) => change({ name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="profile-email">{t("profile.email")}<span className="font-normal text-muted-foreground">{t("profile.readOnly")}</span></Label><Input id="profile-email" autoComplete="email" aria-describedby="profile-email-hint" value={user?.email ?? ""} className="h-11 bg-muted/40 text-muted-foreground" readOnly /><p id="profile-email-hint" className="text-xs text-muted-foreground">{t("profile.emailHint")}</p></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="profile-address">{t("profile.address")}</Label><Input id="profile-address" autoComplete="street-address" disabled={!editing || mutation.isPending} className="h-11 disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-100" value={current.address} onChange={(event) => change({ address: event.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="profile-bio">{t("profile.bio")}</Label><Textarea id="profile-bio" disabled={!editing || mutation.isPending} className="min-h-24 resize-y disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-100" value={current.bio} onChange={(event) => change({ bio: event.target.value })} /></div>
        </div>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}{saved && <p role="status" className="text-sm text-success">{t("profile.saved")}</p>}
        {editing && <div className="flex flex-wrap gap-2 border-t pt-4"><Button type="submit" className="h-11" disabled={mutation.isPending || !changed}>{t(mutation.isPending ? "profile.submitting" : "profile.submit")}</Button><Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={cancel}>{t("common.cancel")}</Button></div>}
      </form></TabsContent>
      <TabsContent value="security" className="max-w-2xl"><section className="space-y-4"><div className="space-y-1"><h2 className="text-base font-semibold">{t("profile.securityTitle")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("password.description")}</p></div><ChangePassword /></section></TabsContent>
      <TabsContent value="display" className="max-w-2xl"><section className="flex items-start justify-between gap-4"><div className="space-y-1"><h2 className="text-base font-semibold">{t("preferences.title")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("profile.displayDescription")}</p><p className="text-xs text-muted-foreground">{t("preferences.saved")}</p></div><DisplayPreferences /></section></TabsContent>
    </Tabs>
  </div>;
}
