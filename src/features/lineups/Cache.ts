import type { QueryClient } from "@tanstack/react-query";

const lineupQueryKey = ["lineups"] as const;

/**
 * Lineups currently arrive through route loaders; this key is the query-cache seam for them.
 * Router invalidation remains the refresh path for loader-backed lineup data.
 */
export function invalidateLineupQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: lineupQueryKey });
}
