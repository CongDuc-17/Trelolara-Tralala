import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { useChangePassword } from "@/features/profile/queries";
import { getApiError } from "@/lib/errors";

export function ChangePassword() {
  const { t } = useTranslation();
  const mutation = useChangePassword();
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  function close() { setOpen(false); setNewPassword(""); setConfirmPassword(""); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (newPassword.length < 8) { setError(t("auth.passwordRequired")); return; }
    if (newPassword !== confirmPassword) { setError(t("password.mismatch")); return; }
    busy.current = true; setError("");
    try { await mutation.mutateAsync({ newPassword }); setSaved(true); close(); }
    catch (error) { if (getApiError(error).kind !== "canceled") setError(getApiError(error).message); }
    finally { busy.current = false; }
  }
  return <div className="space-y-2"><Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) { if (next) { setSaved(false); setOpen(true); } else close(); } }}>
    <DialogTrigger asChild><Button variant="outline" className="h-11">{t("profile.changePassword")}</Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md" showCloseButton={!mutation.isPending}>
      <DialogHeader><DialogTitle>{t("profile.changePassword")}</DialogTitle><DialogDescription>{t("password.description")}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4" aria-busy={mutation.isPending}>
        <div className="space-y-2"><Label htmlFor="password-1">{t("password.new")}</Label><PasswordInput autoFocus id="password-1" name="new-password" autoComplete="new-password" required minLength={8} disabled={mutation.isPending} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="password-2">{t("password.confirm")}</Label><PasswordInput id="password-2" name="confirm-password" autoComplete="new-password" confirmation required minLength={8} disabled={mutation.isPending} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
        <p className="text-xs leading-5 text-muted-foreground">{t("password.sessions")}</p>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={close}>{t("common.cancel")}</Button><Button type="submit" className="h-11" disabled={mutation.isPending}>{t(mutation.isPending ? "password.saving" : "password.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>{saved && <p role="status" className="text-sm text-success">{t("password.saved")}</p>}</div>;
}
