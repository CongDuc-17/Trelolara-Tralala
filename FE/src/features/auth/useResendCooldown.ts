import { useEffect, useState } from "react";

function readDeadline(email: string) {
  const value = Number(sessionStorage.getItem(`otp-retry-at:${email.trim()}`));
  return Number.isFinite(value) ? value : 0;
}

export function saveOtpCooldown(email: string, seconds: number | undefined) {
  const expiresAt = Date.now() + (typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000;
  sessionStorage.setItem(`otp-retry-at:${email.trim()}`, String(expiresAt));
  return expiresAt;
}

export function useResendCooldown(email: string) {
  const [cooldown, setCooldown] = useState(() => ({ email, expiresAt: readDeadline(email) }));
  const [now, setNow] = useState(Date.now);
  const expiresAt = cooldown.email === email ? cooldown.expiresAt : readDeadline(email);
  const resendIn = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const active = resendIn > 0;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return { resendIn, startCooldown: (seconds: number | undefined) => {
    setCooldown({ email, expiresAt: saveOtpCooldown(email, seconds) });
    setNow(Date.now());
  } };
}
