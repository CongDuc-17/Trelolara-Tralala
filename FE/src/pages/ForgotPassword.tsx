import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const SAVED_EMAIL_KEY = "forgot-password-email";
const SAVED_EMAIL_TTL_MS = 15 * 60 * 1000;
const RESEND_SECONDS = 60;

type SavedEmail = {
  email: string;
  expiresAt: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data
  ) {
    return String(error.response.data.message);
  }

  return fallback;
}

function readSavedEmail() {
  const raw = localStorage.getItem(SAVED_EMAIL_KEY);
  if (!raw) {
    return "";
  }

  try {
    const saved = JSON.parse(raw) as SavedEmail;
    if (!saved.email || saved.expiresAt < Date.now()) {
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
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"email" | "reset">("email");
  const [resendIn, setResendIn] = useState(0);
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

  useEffect(() => {
    const savedEmail = readSavedEmail();
    if (savedEmail) {
      setEmail(savedEmail);
      setStep("reset");
    }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendOtp(targetEmail = email) {
    const normalizedEmail = targetEmail.trim();
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }

    setError("");
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
      setResendIn(RESEND_SECONDS);
      toast.success("OTP sent to your email");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to send OTP");
      setError(message);
      toast.error(message);
      console.error("Failed to send OTP", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    await sendOtp();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
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
      toast.success("Password reset successfully");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to reset password");
      setError(message);
      toast.error(message);
      console.error("Failed to reset password", error);
    } finally {
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
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              {step === "email"
                ? "Enter your email to receive a verification code"
                : `Enter the OTP sent to ${email}`}
            </CardDescription>
            <CardAction>
              <Link to="/login">
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

                  {error && <p className="text-sm text-red-600">{error}</p>}

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

                  {error && <p className="text-sm text-red-600">{error}</p>}

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
