import { QueryClient } from "@tanstack/react-query";
import { getApiError } from "@/lib/errors";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: {
    queries: {
      retry: (count, error) => count < 1 && ["network", "timeout"].includes(getApiError(error).kind),
      staleTime: 30_000,
    },
    mutations: { retry: false },
  } });
}
