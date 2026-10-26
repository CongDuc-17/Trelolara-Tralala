import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskSchedule } from "./TaskSchedule";
import { NavUser } from "@/components/nav-user";
import { useSession } from "@/features/auth/session-context";

export function WorkspacePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useSession();
  return <aside id="dashboard-context" hidden={!open} aria-label={t("schedule.title")}
    onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } }}
    className="dashboard-panel dashboard-context flex min-w-0 flex-col overflow-hidden p-4 md:p-5">
    <div className="flex min-w-0 shrink-0 items-center gap-2 pb-5">
      <NavUser user={user} />
      <Button id="dashboard-context-close" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" aria-label={t("overview.hideInfo")} title={t("overview.hideInfo")} onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="dashboard-context-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <TaskSchedule enabled={open} />
    </div>
  </aside>;
}
