import { queryOptions, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
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

export function findCustomLineup(lineups: LineupData["lineups"], id: number) {
  return lineups
    .filter((entry) => entry.kind === "custom")
    .find((entry) => entry.reference.id === id);
}

export async function ensureCustomLineup(queryClient: QueryClient, id: number) {
  const hadCachedData = queryClient.getQueryData(lineupQueryKey) !== undefined;
  const cached = await queryClient.ensureQueryData({
    ...lineupsQueryOptions(),
    revalidateIfStale: true,
  });
  if (findCustomLineup(cached.lineups, id)) return;
  if (!hadCachedData) throw notFound();
  await loadFreshCustomLineup(queryClient, id);
}

async function loadFreshCustomLineup(queryClient: QueryClient, id: number) {
  const fresh = await queryClient.fetchQuery({ ...lineupsQueryOptions(), staleTime: 0 });
  if (!findCustomLineup(fresh.lineups, id)) throw notFound();
}

export function useLineupData() {
  const getLineupDataFn = useServerFn(getLineupData);
  return useSuspenseQuery(lineupsQueryOptions(() => getLineupDataFn()));
}
