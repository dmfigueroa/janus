import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { invalidateLineupQueries, lineupQueryKey } from "@/features/lineups/Cache";

export const watchlistHomeQueryKey = ["watchlists", "home"] as const;

export function invalidateWatchlistQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
    invalidateLineupQueries(queryClient),
  ]);
}

function isKeyPrefix(queryKey: QueryKey, prefix: readonly unknown[]) {
  return prefix.every((segment, index) => queryKey[index] === segment);
}

export function invalidateWatchlistReorderQueries(queryClient: QueryClient, watchlistId: number) {
  const detailPrefix = ["watchlists", "detail", watchlistId] as const;
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      [detailPrefix, watchlistHomeQueryKey, lineupQueryKey].some((prefix) =>
        isKeyPrefix(queryKey, prefix),
      ),
  });
}
