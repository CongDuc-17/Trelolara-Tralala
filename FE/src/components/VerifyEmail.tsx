import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { getApiError } from "@/lib/errors";
import { useSendOtp, useVerifyEmail } from "@/features/auth/queries";
import { authLink, safeReturnTo } from "@/features/auth/redirect";
import { useResendCooldown } from "@/features/auth/useResendCooldown";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

export function VerifyEmail() {
  const { t } = useTranslation();
  const verification = useVerifyEmail();
  const resend = useSendOtp();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const { resendIn, startCooldown } = useResendCooldown();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const navigate = useNavigate();
  const [email] = useState(() => localStorage.getItem("emailForVerification") || "");

  if (!email) return <Navigate to={authLink("/register", returnTo)} replace />;

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    if (otp.length !== 6) {
      setError(t("auth.codeRequired"));
      return;
    }
    try {
      pending.current = true;
      setLoading(true);
      setError("");
      await verification.mutateAsync({
        email,
        otp,
      });
      localStorage.removeItem("emailForVerification");
      toast.success(t("auth.verified"));
      navigate(authLink("/login", returnTo), { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind !== "canceled") { setError(issue.message); }
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  async function handleResend() {
    if (pending.current || resendIn > 0) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await resend.mutateAsync({ email });
      startCooldown();
      toast.success(t("auth.codeSuccess"));
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind !== "canceled") { setError(issue.message); }
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return <AccessLayout title={t("auth.verifyTitle")} description={<>{t("auth.codeSent")} <span className="font-medium text-foreground">{email}</span></>}>
    <form id="verify-form" onSubmit={handleVerify} className="space-y-5" aria-busy={loading}>
      <div className="space-y-3"><Label htmlFor="otp-verification">{t("auth.code")}</Label><InputOTP id="otp-verification" maxLength={6} minLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" value={otp} disabled={loading} required onChange={setOtp} containerClassName="w-full"><InputOTPGroup className="w-full">{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} className="h-12 min-w-0 flex-1 text-xl" />)}</InputOTPGroup></InputOTP><p className="text-xs text-muted-foreground">{t("auth.codeHint")}</p></div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full" disabled={loading || otp.length !== 6}>{t(loading ? "auth.verifying" : "auth.verify")}</Button>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { void handleResend(); }} disabled={loading || resendIn > 0}>{resendIn > 0 ? t("auth.resendIn", { seconds: resendIn }) : t("auth.resendCode")}</Button>
    </form>
    <p className="text-center text-sm"><Link to={authLink("/login", returnTo)} className="rounded-sm text-muted-foreground underline underline-offset-4">{t("auth.backToLogin")}</Link></p>
  </AccessLayout>;
}
