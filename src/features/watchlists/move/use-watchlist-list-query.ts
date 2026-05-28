import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWatchlistList } from "@/features/watchlists/list/query";
import type { WatchlistSummary } from "@/features/watchlists/list/query.server";

export function useWatchlistListQuery({ enabled }: { enabled: boolean }) {
  const watchlistListFn = useServerFn(getWatchlistList);
  return useQuery<WatchlistSummary[], Error>({
    queryKey: ["watchlists", "list", {}],
    queryFn: () => watchlistListFn({ data: {} }),
    staleTime: Infinity,
    enabled,
  });
}
