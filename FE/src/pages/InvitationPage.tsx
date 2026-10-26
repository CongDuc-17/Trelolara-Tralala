import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "@/lib/errors";
import { useSession } from "@/features/auth/session-context";
import { authLink } from "@/features/auth/redirect";
import { useRespondToInvitation } from "@/features/catalog/queries";
import { Button } from "@/components/ui/button";
import { AccessLayout } from "@/components/layout/AccessLayout";
import { useTranslation } from "react-i18next";

export function InvitationPage() {
  const { t } = useTranslation();
  const { scope, token = "" } = useParams();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const mutation = useRespondToInvitation(token);
  const [accountError, setAccountError] = useState("");
  const busy = useRef(false);
  const valid = (scope === "projects" || scope === "boards") && token.length > 0 && token.length <= 512;
  const returnTo = location.pathname + location.search + location.hash;
  const failure = mutation.error ? getApiError(mutation.error) : null;
  // shortcut: BE exposes messages rather than invitation error codes; replace when codes are available.
  const unverified = failure?.status === 403 && failure.message.includes("Verify your email");
  const message = failure?.message.includes("expired") ? t("invitation.expired")
    : failure?.message.includes("already a member") ? t("invitation.member")
      : failure?.message.includes("already processed") ? t("invitation.processed")
        : failure?.status === 404 ? t("invitation.missing")
          : failure?.status === 403 && !unverified ? t("invitation.wrongAccount")
            : unverified ? t("invitation.unverified")
              : failure?.message;

  async function changeAccount() {
    setAccountError("");
    try {
      await session.logout();
      navigate(authLink("/login", returnTo), { replace: true });
    } catch (error) { setAccountError(getApiError(error).message); }
  }

  function respond(action: "accept" | "reject") {
    if (!valid || busy.current || session.isLoggingOut) return;
    busy.current = true;
    mutation.mutate(action, {
      onSuccess: () => {
        toast.success(action === "accept" ? t("invitation.accepted") : t("invitation.rejected"));
        navigate("/dashboard", { replace: true });
      },
      onSettled: () => { busy.current = false; },
    });
  }

  return <AccessLayout title={t(scope === "projects" ? "invitation.projectTitle" : "invitation.boardTitle")} description={t("invitation.description")}>
    {!valid ? <p role="alert" className="text-sm text-destructive">{t("invitation.invalid")}</p> : <div className="space-y-4" aria-busy={mutation.isPending}>
      <div className="space-y-1 rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">{t("invitation.account")}</p><p className="break-all text-sm font-medium">{session.user?.email}</p></div>
      {message && <p role="alert" className="break-words text-sm text-destructive">{message}</p>}
      {unverified && <Button className="h-11 w-full" variant="outline" onClick={() => { localStorage.setItem("emailForVerification", session.user?.email ?? ""); navigate(authLink("/verify", returnTo)); }}>{t("auth.verifyEmail")}</Button>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button className="h-11" disabled={mutation.isPending || session.isLoggingOut} onClick={() => respond("accept")}>{t(mutation.isPending ? "invitation.processing" : "invitation.accept")}</Button><Button variant="outline" className="h-11" disabled={mutation.isPending || session.isLoggingOut} onClick={() => respond("reject")}>{t("invitation.reject")}</Button></div>
      <Button variant="ghost" className="h-11 w-full" disabled={mutation.isPending || session.isLoggingOut} onClick={() => { void changeAccount(); }}>{t("invitation.changeAccount")}</Button>
      {accountError && <p role="alert" className="break-words text-sm text-destructive">{accountError}</p>}
    </div>}
    <p className="text-center text-sm"><Link to="/dashboard" className="rounded-sm text-muted-foreground underline underline-offset-4">{t("invitation.back")}</Link></p>
  </AccessLayout>;
}
