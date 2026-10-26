import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const { t } = useTranslation();
  return <AccessLayout title={t("entry.notFound")} description={t("entry.notFoundDescription")}>
    <p className="text-sm tabular-nums text-muted-foreground">404</p><Button className="h-11 w-full" asChild><Link to="/dashboard">{t("invitation.back")}</Link></Button><p className="text-center text-sm"><Link to="/" className="rounded-sm text-muted-foreground underline underline-offset-4">{t("entry.home")}</Link></p>
  </AccessLayout>;
}
