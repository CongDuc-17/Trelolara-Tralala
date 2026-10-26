import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayPreferences } from "@/components/layout/DisplayPreferences";
import { DitherBurnBackground } from "@/components/layout/DitherBurnBackground";
import { useSession } from "@/features/auth/session-context";
import "@/app/landing.css";

export function Home() {
  const { t } = useTranslation();
  const { user } = useSession();
  const start = user ? "/dashboard" : "/register";
  const startLabel = t(user ? "landing.openWorkspace" : "landing.getStarted");
  return <div className="landing public-shell">
    <DitherBurnBackground />
    <a href="#landing-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">{t("nav.skip")}</a>
    <header className="public-header landing-header"><Link to="/" aria-label="Trelolara" className="public-brand"><span><Columns3 aria-hidden="true" className="size-5" /></span>Trelolara</Link><div className="flex items-center gap-2"><DisplayPreferences /><Button variant="outline" asChild><Link to={user ? "/dashboard" : "/login"}>{t(user ? "landing.workspace" : "auth.login")}</Link></Button></div></header>
    <main id="landing-main" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title"><div className="landing-hero-copy">
        <p className="landing-eyebrow"><span aria-hidden="true" />{t("landing.eyebrow")}</p>
        <h1 id="landing-title">{t("landing.title")}</h1>
        <p className="landing-intro">{t("landing.description")}</p>
        <Button asChild size="lg" className="landing-primary"><Link to={start}>{startLabel}<ArrowRight aria-hidden="true" className="size-4" /></Link></Button>
        <div className="landing-hero-notes"><span><Check aria-hidden="true" className="size-3.5" />{t("landing.noteOne")}</span><span><Check aria-hidden="true" className="size-3.5" />{t("landing.noteTwo")}</span></div>
      </div></section>
    </main>
    <footer className="landing-footer">{t("landing.footer")}</footer>
  </div>;
}
