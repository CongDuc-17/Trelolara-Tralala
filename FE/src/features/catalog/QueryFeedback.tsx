import type { InfiniteData } from "@tanstack/react-query";
import type { ApiEnvelope } from "@/lib/apiClient";
import { getApiError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

export function QueryFeedback({ query, empty, label }: {
  query: { isPending: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown; };
  empty?: boolean;
  label: string;
}) {
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Đang tải {label}…</p>;
  if (query.isError) return <div className="space-y-1 text-sm"><p role="alert">Không tải được {label}. {getApiError(query.error).message}</p>
    <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { query.refetch(); }}>Thử lại</Button></div>;
  if (empty) return <p className="text-sm text-muted-foreground">Chưa có {label}.</p>;
  return null;
}

export function LoadMore({ query, label }: {
  query: { data?: InfiniteData<ApiEnvelope<unknown[]>>; hasNextPage: boolean; isFetching: boolean; fetchNextPage: () => unknown; };
  label: string;
}) {
  const pages = query.data?.pages;
  if (!pages) return null;
  const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
  const total = pages[0]?.pagination?.totalItems ?? loaded;
  return <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-muted-foreground">
    <span>{loaded}/{total} {label}</span>
    {query.hasNextPage && <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => { query.fetchNextPage(); }}>
      {query.isFetching ? "Đang tải…" : `Tải thêm ${label}`}
    </Button>}
  </div>;
}
