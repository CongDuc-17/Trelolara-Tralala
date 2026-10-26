import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { getApiError } from "@/lib/errors";
import { useMemo } from "react";
import { useResetPassword, useSendOtp } from "@/features/auth/queries";
import { useSession } from "@/features/auth/session-context";
import { useResendCooldown } from "@/features/auth/useResendCooldown";
import { authLink, safeReturnTo } from "@/features/auth/redirect";

const SAVED_EMAIL_KEY = "forgot-password-email";
const SAVED_EMAIL_TTL_MS = 15 * 60 * 1000;

type SavedEmail = {
  email: string;
  expiresAt: number;
};

function readSavedEmail() {
  const raw = localStorage.getItem(SAVED_EMAIL_KEY);
  if (!raw) {
    return "";
  }

  try {
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null || !("email" in saved) ||
      typeof saved.email !== "string" || !saved.email || !("expiresAt" in saved) ||
      typeof saved.expiresAt !== "number" || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
      localStorage.removeItem(SAVED_EMAIL_KEY);
      return "";
    }

    return saved.email;
  } catch {
    localStorage.removeItem(SAVED_EMAIL_KEY);
    return "";
  }
}

function saveEmail(email: string) {
  const saved: SavedEmail = {
    email,
    expiresAt: Date.now() + SAVED_EMAIL_TTL_MS,
  };

  localStorage.setItem(SAVED_EMAIL_KEY, JSON.stringify(saved));
}

export function ForgotPassword() {
  const { t } = useTranslation();
  const requestOtp = useSendOtp();
  const resetPassword = useResetPassword();
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const routeState: unknown = useLocation().state;
  const requestedEmail = routeState && typeof routeState === "object" && "email" in routeState && typeof routeState.email === "string" ? routeState.email : "";
  const [savedEmail] = useState(readSavedEmail);
  const [email, setEmail] = useState(requestedEmail || savedEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">(savedEmail && (!requestedEmail || requestedEmail === savedEmail) ? "reset" : "email");
  const { resendIn, startCooldown } = useResendCooldown(email);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmitReset = useMemo(
    () =>
      /^\d{6}$/.test(otp.trim()) &&
      newPassword.length >= 8 &&
      confirmPassword.length >= 8 &&
      newPassword === confirmPassword,
    [confirmPassword, newPassword, otp],
  );

  async function sendOtp(targetEmail = email) {
    if (pending.current || (step === "reset" && resendIn > 0)) return;
    const normalizedEmail = targetEmail.trim();
    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      return;
    }

    setError("");
    pending.current = true;
    setIsLoading(true);

    try {
      const result = await requestOtp.mutateAsync({ email: normalizedEmail });

      saveEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("reset");
      startCooldown(result.data?.retryAfterSeconds);
      toast.success(t("auth.codeSuccess"));
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      if (issue.code === "OTP_COOLDOWN" && issue.retryAfterSeconds !== undefined) {
        saveEmail(normalizedEmail);
        setEmail(normalizedEmail);
        setStep("reset");
        startCooldown(issue.retryAfterSeconds);
        toast.success(t("auth.existingCode"));
        return;
      }
      const message = issue.message;
      setError(message);
    } finally {
      pending.current = false;
      setIsLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    await sendOtp();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    setError("");

    if (!/^\d{6}$/.test(otp.trim())) {
      setError(t("auth.codeRequired"));
      return;
    }

    if (newPassword.length < 8) {
      setError(t("auth.passwordRequired"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("auth.mismatch"));
      return;
    }

    pending.current = true;
    setIsLoading(true);

    try {
      await resetPassword.mutateAsync({
        email: email.trim(),
        newPassword,
        otp: otp.trim(),
      });

      localStorage.removeItem(SAVED_EMAIL_KEY);
      session.startSession();
      toast.success(t("auth.resetSuccess"));
      navigate(authLink("/login", returnTo), { replace: true });
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

  function handleChangeEmail() {
    localStorage.removeItem(SAVED_EMAIL_KEY);
    setStep("email");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  }

  return <AccessLayout backdrop title={t("auth.resetTitle")} description={step === "email" ? t("auth.resetDescription") : <>{t("auth.codeSent")} <span className="font-medium text-foreground">{email}</span></>}>
    {step === "email" ? <form onSubmit={handleRequestOtp} className="space-y-5" aria-busy={isLoading}>
      <div className="space-y-2"><Label htmlFor="email">{t("profile.email")}</Label><Input id="email" name="email" type="email" autoComplete="email" required disabled={isLoading} className="h-11" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={isLoading}>{t(isLoading ? "auth.sendingCode" : "auth.sendCode")}</Button>
    </form> : <form onSubmit={handleResetPassword} className="space-y-4" aria-busy={isLoading}>
      <div className="space-y-2"><Label htmlFor="otp">{t("auth.otp")}</Label><Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={isLoading} value={otp} className="h-11 tracking-widest" onChange={(event) => { setOtp(event.target.value.trim()); setError(""); }} /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{t("auth.codeHint")}</span><Button type="button" variant="link" className="h-11 p-0" disabled={isLoading || resendIn > 0} onClick={() => { void sendOtp(); }}>{resendIn > 0 ? t("auth.resendIn", { seconds: resendIn }) : t("auth.resendCode")}</Button></div></div>
      <div className="space-y-2"><Label htmlFor="new-password">{t("password.new")}</Label><PasswordInput id="new-password" name="new-password" autoComplete="new-password" required minLength={8} disabled={isLoading} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} /></div>
      <div className="space-y-2"><Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label><PasswordInput id="confirm-password" name="confirm-password" autoComplete="new-password" confirmation required minLength={8} disabled={isLoading} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} /></div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={isLoading || !canSubmitReset}>{t(isLoading ? "auth.resetting" : "auth.resetTitle")}</Button>
      <Button type="button" variant="ghost" className="h-11 w-full" disabled={isLoading} onClick={handleChangeEmail}>{t("auth.differentEmail")}</Button>
    </form>}
    <p className="text-center text-sm"><Link to={authLink("/login", returnTo)} className="rounded-sm text-muted-foreground underline underline-offset-4">{t("auth.backToLogin")}</Link></p>
  </AccessLayout>;
}
