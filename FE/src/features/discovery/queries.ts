import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { CanceledError } from "axios";
import { useSession } from "@/features/auth/session-context";
import { getSessionVersion } from "@/lib/apiClient";
import { searchTasks } from "./api";
import type { TaskFilters } from "./types";

export function useTaskSearch(filters: TaskFilters, boardId?: string, enabled = true) {
  const { user } = useSession();
  const client = useQueryClient();
  const version = getSessionVersion();
  const key = ["discovery", version, user?.id, boardId ?? "mine", filters] as const;
  const query = useInfiniteQuery({
    queryKey: key,
    enabled: enabled && !!user?.id,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (version !== getSessionVersion()) throw new CanceledError();
      const page = await searchTasks(filters, boardId, pageParam, signal);
      if (version !== getSessionVersion()) throw new CanceledError();
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  return { ...query, restart: async () => { await client.resetQueries({ queryKey: key, exact: true }); } };
}
