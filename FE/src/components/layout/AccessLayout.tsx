import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Columns3 } from "lucide-react";
import { DisplayPreferences } from "./DisplayPreferences";

export function AccessLayout({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const titleId = useId();
  return <div className="flex min-h-dvh flex-col bg-frame text-foreground">
    <header className="flex h-12 shrink-0 items-center justify-between px-4 md:px-6"><Link to="/" className="inline-flex items-center gap-2 rounded-sm text-sm font-semibold tracking-tight"><Columns3 className="size-5 text-primary" />Trelolara</Link><DisplayPreferences /></header>
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-6 sm:py-10">
      <section aria-labelledby={titleId} className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-5 sm:p-8">
        <div className="space-y-2"><h1 id={titleId} className="break-words text-2xl font-semibold tracking-tight">{title}</h1>{description && <div className="break-words text-sm leading-6 text-muted-foreground">{description}</div>}</div>
        {children}
      </section>
    </main>
  </div>;
}
