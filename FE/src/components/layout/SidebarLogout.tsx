import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { useSession } from "@/features/auth/session-context";
import { getApiError } from "@/lib/errors";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SidebarLogout() {
  const { t } = useTranslation();
  const { logout, isLoggingOut } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const disabled = pending || isLoggingOut;
  async function confirm() {
    if (busy.current || isLoggingOut) return;
    busy.current = true; setPending(true); setError("");
    try { await logout(); navigate("/login", { replace: true }); setOpen(false); }
    catch (error) { const issue = getApiError(error); if (issue.kind !== "canceled") setError(issue.message); }
    finally { busy.current = false; setPending(false); }
  }
  return <SidebarMenu className="items-center"><SidebarMenuItem><AlertDialog open={open} onOpenChange={(next) => { if (!busy.current && !isLoggingOut) { setOpen(next); setError(""); } }}>
    <AlertDialogTrigger asChild><SidebarMenuButton id="sidebar-logout" tooltip={t("account.logout")} aria-label={t("account.logout")} disabled={disabled} className="size-11 justify-center p-3 text-muted-foreground group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-3!"><LogOut /><span className="sr-only">{t("account.logout")}</span></SidebarMenuButton></AlertDialogTrigger>
    <AlertDialogContent className="rounded-2xl" aria-busy={disabled} onEscapeKeyDown={(event) => { if (disabled) event.preventDefault(); }}>
      <AlertDialogHeader><AlertDialogTitle>{t("account.logoutTitle")}</AlertDialogTitle><AlertDialogDescription>{t("account.logoutDescription")}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel className="h-11" disabled={disabled}>{t("common.cancel")}</AlertDialogCancel><Button className="h-11" disabled={disabled} onClick={() => { void confirm(); }}>{pending && <Spinner />}{t(pending ? "account.loggingOut" : "account.logout")}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></SidebarMenuItem></SidebarMenu>;
}
