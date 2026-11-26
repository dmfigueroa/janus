import type { QueryClient } from "@tanstack/react-query";

export const lineupQueryKey = ["lineups"] as const;

export function invalidateLineupQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: lineupQueryKey });
}
