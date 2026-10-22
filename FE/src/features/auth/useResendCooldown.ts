import { useEffect, useState } from "react";

export function useResendCooldown() {
  const [resendIn, setResendIn] = useState(0);
  const active = resendIn > 0;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return { resendIn, startCooldown: () => setResendIn(60) };
}
