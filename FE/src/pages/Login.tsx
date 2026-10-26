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
import { googleLoginUrl } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-context";
import { authLink, safeReturnTo, saveOAuthReturnTo, takeOAuthReturnTo } from "@/features/auth/redirect";

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const pending = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    if (!email.trim() || password.length < 8) {
      setError(t("auth.loginRequired"));
      return;
    }
    pending.current = true;
    takeOAuthReturnTo();
    setError("");
    setIsLoading(true);

    try {
      await session.login({ email: email.trim(), password });

      toast.success(t("auth.loginSuccess"));
      navigate(returnTo, { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      setError(message);
    } finally {
      pending.current = false;
      setIsLoading(false);
    }
  }

  function handleLoginGoogle() {
    if (pending.current) return;
    try {
      const url = googleLoginUrl();
      saveOAuthReturnTo(returnTo);
      session.startSession();
      pending.current = true;
      setIsLoading(true);
      window.location.assign(url);
    } catch (error) {
      pending.current = false;
      setIsLoading(false);
      setError(getApiError(error).message);
    }
  }

  return <AccessLayout backdrop title={t("auth.loginTitle")} description={t("auth.loginDescription")}>
    <form onSubmit={handleSubmit} className="auth-form space-y-4" aria-busy={isLoading}>
      <div className="space-y-2"><Label htmlFor="email">{t("profile.email")}</Label><Input id="email" name="email" type="email" autoComplete="email" required className="h-11" disabled={isLoading} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></div>
      <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="password">{t("auth.password")}</Label><Link to={authLink("/forgot-password", returnTo)} className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline">{t("auth.forgot")}</Link></div><PasswordInput id="password" name="password" required minLength={8} autoComplete="current-password" disabled={isLoading} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} /></div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {/* shortcut: BE exposes unverified accounts only through this message; use an error code when available. */}
      {error.includes("has not been verified") && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { localStorage.setItem("emailForVerification", email.trim()); navigate(authLink("/verify", returnTo)); }}>{t("auth.verifyEmail")}</Button>}
      <Button type="submit" className="h-11 w-full" disabled={isLoading}>{t(isLoading ? "auth.loggingIn" : "auth.login")}</Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{t("auth.or")}</span><span className="h-px flex-1 bg-border" /></div>
      <Button variant="outline" type="button" className="h-11 w-full" disabled={isLoading} onClick={handleLoginGoogle}>{t("auth.google")}</Button>
    </form>
    <p className="text-center text-sm text-muted-foreground">{t("auth.noAccount")} <Link to={authLink("/register", returnTo)} className="rounded-sm font-medium text-foreground underline underline-offset-4">{t("auth.register")}</Link></p>
  </AccessLayout>;
}
