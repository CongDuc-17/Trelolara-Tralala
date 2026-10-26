import type { InfiniteData } from "@tanstack/react-query";
import type { ApiEnvelope } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function QueryFeedback({ query, empty, label }: {
  query: { isPending: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown; };
  empty?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("common.loadingResource", { label })}</p>;
  if (query.isError) return <div className="space-y-1 text-sm"><p role="alert">{t("common.loadError", { label })} {getApiError(query.error).message}</p>
    <Button size="sm" variant="outline" className="h-11 sm:h-8" disabled={query.isFetching} onClick={() => { query.refetch(); }}>{t("common.retry")}</Button></div>;
  if (empty) return <p className="text-sm text-muted-foreground">{t("common.empty", { label })}</p>;
  return null;
}

export function LoadMore({ query, label }: {
  query: { data?: InfiniteData<ApiEnvelope<unknown[]>>; hasNextPage: boolean; isFetching: boolean; fetchNextPage: () => unknown; };
  label: string;
}) {
  const { t } = useTranslation();
  const pages = query.data?.pages;
  if (!pages) return null;
  const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
  const total = pages[0]?.pagination?.totalItems ?? loaded;
  return <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-muted-foreground">
    <span>{loaded}/{total} {label}</span>
    {query.hasNextPage && <Button size="sm" variant="outline" className="h-11 sm:h-8" disabled={query.isFetching} onClick={() => { query.fetchNextPage(); }}>
      {query.isFetching ? t("common.loading") : t("common.loadMore", { label })}
    </Button>}
  </div>;
}
