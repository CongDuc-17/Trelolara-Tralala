import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { TaskPage } from "./types";

export async function refreshTaskQueries(client: QueryClient, scope: readonly unknown[]) {
  await client.cancelQueries({ queryKey: scope });
  // A changed card can invalidate a later cursor; reconcile from page one, keeping visible rows while it loads.
  client.setQueriesData<InfiniteData<TaskPage>>({ queryKey: scope }, (data) => data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
  return client.invalidateQueries({ queryKey: scope });
}
