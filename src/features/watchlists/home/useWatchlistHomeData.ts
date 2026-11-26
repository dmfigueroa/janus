import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { watchlistHomeQueryKey } from "@/features/watchlists/Cache";
import {
  getWatchlistHomeData,
  type WatchlistHomeData,
} from "@/features/watchlists/home/WatchlistHome";

const OVERVIEW_STALE_TIME_MS = 2_000;

export function watchlistHomeQueryOptions(
  queryFn: () => Promise<WatchlistHomeData> = () => getWatchlistHomeData(),
) {
  return queryOptions({
    queryKey: watchlistHomeQueryKey,
    queryFn,
    staleTime: OVERVIEW_STALE_TIME_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function useWatchlistHomeData() {
  const getWatchlistHomeDataFn = useServerFn(getWatchlistHomeData);
  return useSuspenseQuery(watchlistHomeQueryOptions(() => getWatchlistHomeDataFn()));
}
