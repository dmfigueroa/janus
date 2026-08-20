import type { QueryClient } from "@tanstack/react-query";

export function invalidateWatchlistQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["watchlists"] });
}
