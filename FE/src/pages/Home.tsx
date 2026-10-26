import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { Button } from "@/components/ui/button";

export function Home() {
  const { t } = useTranslation();
  return <AccessLayout title={t("entry.title")} description={t("entry.description")}>
    <div className="space-y-3"><Button className="h-11 w-full" asChild><Link to="/dashboard">{t("entry.open")}</Link></Button><Button variant="outline" className="h-11 w-full" asChild><Link to="/register">{t("auth.register")}</Link></Button></div>
    <p className="text-sm leading-6 text-muted-foreground">{t("entry.hint")}</p>
  </AccessLayout>;
}
