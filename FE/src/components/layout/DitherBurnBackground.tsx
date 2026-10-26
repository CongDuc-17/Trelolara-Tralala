import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/app/public.css";

const Canvas = lazy(() => import("./DitherBurnCanvas"));
const staticQuery = "(prefers-reduced-motion: reduce), (hover: none), (max-width: 767px)";

export function DitherBurnBackground() {
  const { t } = useTranslation();
  const [still, setStill] = useState(() => window.matchMedia(staticQuery).matches);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const media = window.matchMedia(staticQuery);
    const change = () => setStill(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return <><div className="public-backdrop" aria-hidden="true"><div className="public-backdrop-media"><img className="public-backdrop-poster" src="/illustrations/dither-burn.webp" width="1280" height="800" alt="" />{!still && !failed && <Suspense fallback={null}><Canvas paused={paused} onFailure={fail} /></Suspense>}</div></div>{!still && !failed && <div className="public-motion-control"><Button type="button" variant="outline" size="icon" aria-pressed={paused} aria-label={t(paused ? "landing.resume" : "landing.pause")} title={t(paused ? "landing.resume" : "landing.pause")} onClick={() => setPaused(!paused)}>{paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}</Button></div>}</>;
}
