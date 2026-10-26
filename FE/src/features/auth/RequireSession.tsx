import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getApiError } from "@/lib/errors";
import { useSession } from "./session-context";
import { authLink, takeOAuthReturnTo } from "./redirect";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { useTranslation } from "react-i18next";

export function RequireSession() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.user && location.pathname === "/dashboard") {
      const path = takeOAuthReturnTo();
      if (path && path !== "/dashboard") navigate(path, { replace: true });
    }
  }, [session.user, location.pathname, navigate]);

  if (session.isLoading) return <AccessLayout title={t("auth.checkingTitle")}><div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t("auth.checking")}</div></AccessLayout>;
  if (session.error) return <AccessLayout title={t("auth.sessionError")}>
    <p role="alert" className="break-words text-sm">{getApiError(session.error).message}</p>
    <Button className="h-11 w-full" onClick={session.retry}>{t("common.retry")}</Button>
    <p className="text-center text-sm"><Link className="rounded-sm text-muted-foreground underline underline-offset-4" to={authLink("/login", location.pathname + location.search + location.hash)}>{t("auth.backToLogin")}</Link></p>
  </AccessLayout>;
  if (!session.user) return <Navigate replace to={authLink("/login", location.pathname + location.search + location.hash)} />;
  return <Outlet />;
}
