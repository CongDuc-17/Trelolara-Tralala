import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { getApiError } from "@/lib/errors";
import { useRegister } from "@/features/auth/queries";
import { authLink, safeReturnTo } from "@/features/auth/redirect";

export function Register() {
  const { t } = useTranslation();
  const registration = useRegister();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));

  const navigate = useNavigate();
  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (name.trim().length < 2) {
      setError(t("auth.nameRequired"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.mismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordRequired"));
      return;
    }
    try {
      pending.current = true;
      setLoading(true);
      await registration.mutateAsync({
        email: email.trim(),
        password,
        name: name.trim(),
      });
      localStorage.setItem("emailForVerification", email.trim());
      toast.success(t("auth.registered"));
      navigate(authLink("/verify", returnTo), { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      setError(message);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return <AccessLayout title={t("auth.registerTitle")} description={t("auth.registerDescription")}>
    <form id="register-form" onSubmit={handleRegister} className="space-y-4" aria-busy={loading}>
      <div className="space-y-2"><Label htmlFor="name">{t("profile.name")}</Label><Input id="name" name="name" minLength={2} maxLength={100} autoComplete="name" required disabled={loading} className="h-11" value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="email">{t("profile.email")}</Label><Input id="email" name="email" type="email" autoComplete="email" required disabled={loading} className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="password">{t("auth.password")}</Label><PasswordInput id="password" name="password" minLength={8} autoComplete="new-password" required disabled={loading} value={password} onChange={(event) => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p></div>
      <div className="space-y-2"><Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label><PasswordInput id="confirm-password" name="confirm-password" confirmation minLength={8} autoComplete="new-password" required disabled={loading} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={loading}>{t(loading ? "auth.registering" : "auth.register")}</Button>
    </form>
    <p className="text-center text-sm text-muted-foreground">{t("auth.haveAccount")} <Link to={authLink("/login", returnTo)} className="rounded-sm font-medium text-foreground underline underline-offset-4">{t("auth.login")}</Link></p>
  </AccessLayout>;
}
