import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/features/notifications/queries";
import { isRecord } from "@/features/notifications/types";
import { notificationTarget } from "@/features/notifications/target";
import { getApiError } from "@/lib/errors";

export function Notifications() {
  const { t, i18n } = useTranslation();
  const [showRead, setShowRead] = useState(false);
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, isLoading, hasMore, error, refresh, loadNextPage, markRead, markAllRead, readPending, clearReadError } = useNotifications(showRead);
  const feedback = error ? getApiError(error) : null;
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN";
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) refresh(); }}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative size-9 text-muted-foreground" aria-label={unreadCount > 0 ? t("notifications.unreadCount", { count: unreadCount }) : t("notifications.title")}><Bell className="size-5" />{unreadCount > 0 && <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 border-0 px-1 py-0 tabular-nums">{unreadCount > 99 ? "99+" : unreadCount}</Badge>}</Button></PopoverTrigger>
    <PopoverContent align="end" aria-label={t("notifications.title")} className="notifications-panel w-[min(27rem,calc(100vw-2rem))] overflow-hidden p-0">
      <div className="space-y-3 border-b p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{t("notifications.title")}</h2><Button size="icon" variant="ghost" className="size-11" aria-label={t("notifications.refresh")} disabled={isLoading} onClick={refresh}><RefreshCw className="size-4" /></Button></div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{t(showRead ? "notifications.readHelp" : "notifications.unreadHelp")}</p><div className="flex items-center gap-2"><Switch id="show-read" checked={showRead} onCheckedChange={(value) => { clearReadError(); setShowRead(value); }} /><Label htmlFor="show-read">{t("notifications.showRead")}</Label></div></div></div>
      <div className="max-h-[min(30rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain" aria-busy={isLoading}>
        {!showRead && unreadCount > 0 && <div className="border-b px-4 py-1"><Button type="button" variant="ghost" size="sm" disabled={readPending || isLoading} onClick={markAllRead}><CheckCheck className="size-4" />{t("notifications.markAllRead")}</Button></div>}
        {feedback && feedback.kind !== "canceled" && <div className="space-y-2 border-b p-4 text-sm"><p role="alert" className="break-words">{feedback.message}</p><Button size="sm" variant="outline" disabled={isLoading} onClick={refresh}>{t("common.retry")}</Button></div>}
        {isLoading && notifications.length === 0 ? <div role="status" aria-label={t("notifications.loading")} className="space-y-4 p-4">{[1, 2, 3].map((id) => <div key={id} className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /></div>)}</div> : notifications.length === 0 && !error && <p className="p-6 text-sm text-muted-foreground">{t(showRead ? "notifications.emptyRead" : "notifications.emptyUnread")}</p>}
        <ul>{notifications.filter((item) => item.isRead === showRead).map((notification) => {
          const to = notificationTarget(notification);
          const metadata = notification.metadata;
          const content = <><span className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{t("notifications.types." + notification.type, { defaultValue: notification.title })}</span>{!notification.isRead && <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">{notification.content}</span>{notification.type === "CARD_DUE_SOON" && isRecord(metadata) && typeof metadata.dueDate === "string" && Number.isFinite(Date.parse(metadata.dueDate)) && <span className="mt-1 block text-xs text-muted-foreground">{t("notifications.reminderDue", { date: new Date(metadata.dueDate).toLocaleString(locale) })}</span>}<time dateTime={notification.createdAt} className="mt-2 block text-xs tabular-nums text-muted-foreground">{new Date(notification.createdAt).toLocaleString(locale)}</time></>;
          const classes = "block w-full min-w-0 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
          return <li key={notification.id} className="border-b last:border-b-0">{to ? <Link to={to} className={classes} onClick={() => markRead(notification)}>{content}</Link> : <Button type="button" variant="ghost" className={`${classes} h-auto whitespace-normal rounded-none font-normal`} disabled={notification.isRead || readPending} aria-label={t("notifications.markRead") + ": " + notification.title} onClick={() => markRead(notification)}>{content}</Button>}</li>;
        })}</ul>
        {hasMore && <div className="border-t p-3"><Button type="button" variant="outline" disabled={isLoading} className="h-11 w-full" onClick={loadNextPage}>{t(isLoading ? "common.loading" : "notifications.more")}</Button></div>}
      </div>
    </PopoverContent>
  </Popover>;
}
