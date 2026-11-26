import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lineupQueryKey } from "@/features/lineups/Cache";
import { getLineupData, type LineupData } from "@/features/lineups/manage/Lineups";

const OVERVIEW_STALE_TIME_MS = 2_000;

export function lineupsQueryOptions(queryFn: () => Promise<LineupData> = () => getLineupData()) {
  return queryOptions({
    queryKey: lineupQueryKey,
    queryFn,
    staleTime: OVERVIEW_STALE_TIME_MS,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function useLineupData() {
  const getLineupDataFn = useServerFn(getLineupData);
  return useSuspenseQuery(lineupsQueryOptions(() => getLineupDataFn()));
}
