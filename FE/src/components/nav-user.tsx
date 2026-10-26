import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@/features/auth/types";

export function NavUser({ user }: { user: User | null }) {
  const { t } = useTranslation();
  const name = user?.name ?? t("account.fallback");
  return <div role="group" aria-label={t("account.label", { name })} className="flex min-w-0 flex-1 items-center gap-3">
    <Avatar aria-hidden="true" className="size-10 shrink-0"><AvatarImage src={user?.avatar ?? ""} alt="" /><AvatarFallback className="bg-accent text-xs text-accent-foreground">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <div className="min-w-0 space-y-1"><p className="truncate text-sm font-semibold" title={name}>{name}</p><p className="truncate text-xs text-muted-foreground" title={user?.email}>{user?.email}</p></div>
  </div>;
}
