import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Columns3 } from "lucide-react";
import { DisplayPreferences } from "./DisplayPreferences";
import { DitherBurnBackground } from "./DitherBurnBackground";

export function AccessLayout({ title, description, children, backdrop = false }: { title: string; description?: ReactNode; children: ReactNode; backdrop?: boolean }) {
  const titleId = useId();
  return <div className={`access-layout flex min-h-dvh flex-col bg-frame text-foreground ${backdrop ? "public-shell auth-shell" : ""}`}>
    {backdrop && <DitherBurnBackground />}
    <header className={`access-header flex h-12 shrink-0 items-center justify-between px-4 md:px-6 ${backdrop ? "public-header" : ""}`}><Link to="/" className={backdrop ? "public-brand" : "inline-flex items-center gap-2 rounded-sm text-sm font-semibold tracking-tight"}><span><Columns3 aria-hidden="true" className="size-5 text-primary" /></span>Trelolara</Link><DisplayPreferences /></header>
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-6 sm:py-10">
      <section aria-labelledby={titleId} className="access-card w-full max-w-md space-y-6 rounded-2xl border bg-card p-5 sm:p-8">
        <div className="space-y-2"><h1 id={titleId} className="break-words text-2xl font-semibold tracking-tight">{title}</h1>{description && <div className="break-words text-sm leading-6 text-muted-foreground">{description}</div>}</div>
        {children}
      </section>
    </main>
  </div>;
}
