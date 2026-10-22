import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { apiClient } from "@/lib/apiClient";
import { useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { getApiError } from "@/lib/errors";
import { authLink, safeReturnTo } from "@/features/auth/redirect";
import { useResendCooldown } from "@/features/auth/useResendCooldown";

export function VerifyEmail() {
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
      toast.error("Please enter the 6-digit code");
      return;
    }
    try {
      pending.current = true;
      setLoading(true);
      setError("");
      await apiClient.post("/auth/verify", {
        email,
        otp,
      });
      localStorage.removeItem("emailForVerification");
      toast.success("Email verified successfully. You can now log in.");
      navigate(authLink("/login", returnTo), { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind !== "canceled") { setError(issue.message); toast.error(issue.message); }
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
      await apiClient.post("/auth/send-otp", { email });
      startCooldown();
      toast.success("OTP sent to your email");
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind !== "canceled") { setError(issue.message); toast.error(issue.message); }
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return (
    <>
      <Toaster position="top-right" />
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <form id="verify-form" className="max-w-md" onSubmit={handleVerify}>
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle><h1>Verify your login</h1></CardTitle>
            <CardDescription>
              Enter the verification code we sent to your email address:{" "}
              <span className="font-medium">{email}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="otp-verification">
                  Verification code
                </FieldLabel>
                <Button type="button" variant="outline" size="xs" onClick={handleResend} disabled={loading || resendIn > 0}>
                  <RefreshCwIcon />
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend Code"}
                </Button>
              </div>
              <InputOTP
                maxLength={6}
                minLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                disabled={loading}
                id="otp-verification"
                required
                onChange={setOtp}
              >
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator className="mx-2" />
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </Field>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </CardContent>
          <CardFooter>
            <Field>
              <Button
                type="submit"
                form="verify-form"
                className="w-full"
                disabled={loading}
              >
                Verify
              </Button>
            </Field>
          </CardFooter>
        </Card>
        </form>
      </div>
    </>
  );
}
