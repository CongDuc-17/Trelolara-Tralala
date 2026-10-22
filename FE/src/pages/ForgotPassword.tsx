import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast, Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
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
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [savedEmail] = useState(readSavedEmail);
  const [email, setEmail] = useState(savedEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"email" | "reset">(savedEmail ? "reset" : "email");
  const { resendIn, startCooldown } = useResendCooldown();
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmitReset = useMemo(
    () =>
      otp.trim().length === 6 &&
      newPassword.length >= 8 &&
      confirmPassword.length >= 8 &&
      newPassword === confirmPassword,
    [confirmPassword, newPassword, otp],
  );

  async function sendOtp(targetEmail = email) {
    if (pending.current || resendIn > 0) return;
    const normalizedEmail = targetEmail.trim();
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }

    setError("");
    pending.current = true;
    setIsLoading(true);

    try {
      await apiClient.post(
        "/auth/send-otp",
        { email: normalizedEmail },
        { withCredentials: true },
      );

      saveEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("reset");
      startCooldown();
      toast.success("OTP sent to your email");
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      setError(message);
      toast.error(message);
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

    if (otp.trim().length !== 6) {
      setError("OTP must be 6 characters");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match");
      return;
    }

    pending.current = true;
    setIsLoading(true);

    try {
      await apiClient.post(
        "/auth/forgot-password",
        {
          email: email.trim(),
          newPassword,
          otp: otp.trim(),
        },
        { withCredentials: true },
      );

      localStorage.removeItem(SAVED_EMAIL_KEY);
      session.startSession();
      toast.success("Password reset successfully");
      navigate(authLink("/login", returnTo), { replace: true });
    } catch (error) {
      const issue = getApiError(error);
      if (issue.kind === "canceled") return;
      const message = issue.message;
      setError(message);
      toast.error(message);
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

  return (
    <>
      <Toaster position="top-right" />
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle><h1>Reset Password</h1></CardTitle>
            <CardDescription>
              {step === "email"
                ? "Enter your email to receive a verification code"
                : `Enter the OTP sent to ${email}`}
            </CardDescription>
            <CardAction>
              <Link to={authLink("/login", returnTo)}>
                <Button variant="link">Back to Login</Button>
              </Link>
            </CardAction>
          </CardHeader>

          <CardContent>
            {step === "email" ? (
              <form onSubmit={handleRequestOtp}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Email"
                      required
                      disabled={isLoading}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                    />
                  </div>

                  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Sending OTP..." : "Send OTP"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="otp">OTP</Label>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm"
                        disabled={isLoading || resendIn > 0}
                        onClick={() => sendOtp()}
                      >
                        {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                      </Button>
                    </div>
                    <Input
                      id="otp"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit OTP"
                      required
                      disabled={isLoading}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.trim());
                        setError("");
                      }}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="new-password">New password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        disabled={isLoading}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setError("");
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        onClick={() => setShowNewPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-900"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repeat new password"
                        required
                        minLength={8}
                        disabled={isLoading}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError("");
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                        onClick={() =>
                          setShowConfirmPassword((current) => !current)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-900"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || !canSubmitReset}
                    >
                      {isLoading ? "Resetting password..." : "Reset Password"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={isLoading}
                      onClick={handleChangeEmail}
                    >
                      Use a different email
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
