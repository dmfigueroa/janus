import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { type WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  watchlistDetailQueryFamily,
  watchlistDetailQueryKey,
  normalizeFiltersFromDetailQueryKey,
  readFiltersFromDetailQueryKey,
} from "@/features/watchlists/detail/query";
import { isFullCustomWatchlistDetailQuery } from "@/features/watchlists/detail/reorder";
import {
  updateWatchlistDetailPagesAfterToggle,
  updateWatchlistDetailPagesAfterItemOrderMode,
  updateWatchlistDetailPagesAfterReorder,
} from "@/features/watchlists/detail/transform";

export type WatchlistDetailCacheSnapshot = Array<
  [QueryKey, InfiniteData<WatchlistDetailPage, number> | undefined]
>;

export type WatchlistDetailItemOrderModeSnapshot = {
  previousEntries: WatchlistDetailCacheSnapshot;
  createdKeys: QueryKey[];
};

export async function optimisticallyToggleWatchedItem({
  queryClient,
  watchlistId,
  itemId,
  previousIsWatched,
  nextIsWatched,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
}): Promise<WatchlistDetailCacheSnapshot> {
  const queryKey = watchlistDetailQueryFamily(watchlistId);

  await queryClient.cancelQueries({ queryKey });
  const snapshot = queryClient.getQueriesData<InfiniteData<WatchlistDetailPage, number>>({
    queryKey,
  });

  for (const [cacheKey, previousData] of snapshot) {
    const filters = readFiltersFromDetailQueryKey(cacheKey);

    queryClient.setQueryData(
      cacheKey,
      updateWatchlistDetailPagesAfterToggle({
        data: previousData,
        itemId,
        previousIsWatched,
        nextIsWatched,
        removeWatchedFromUnwatchedOnly: filters?.unwatchedOnly === true,
      }),
    );
  }

  return snapshot;
}

export async function optimisticallyUpdateWatchlistItemOrderMode({
  queryClient,
  watchlistId,
  nextItemOrderMode,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  previousItemOrderMode: WatchlistItemOrderMode;
  nextItemOrderMode: WatchlistItemOrderMode;
}): Promise<WatchlistDetailItemOrderModeSnapshot> {
  const queryKey = watchlistDetailQueryFamily(watchlistId);

  await queryClient.cancelQueries({ queryKey });
  const previousEntries = queryClient.getQueriesData<InfiniteData<WatchlistDetailPage, number>>({
    queryKey,
  });
  const previousKeys = new Set(previousEntries.map(([cacheKey]) => JSON.stringify(cacheKey)));
  const createdKeys: QueryKey[] = [];

  for (const [cacheKey, previousData] of previousEntries) {
    const filters = normalizeFiltersFromDetailQueryKey(cacheKey, watchlistId);

    if (!filters) {
      continue;
    }

    const nextKey = watchlistDetailQueryKey({
      ...filters,
      itemOrderMode: nextItemOrderMode,
    });

    queryClient.setQueryData(
      nextKey,
      updateWatchlistDetailPagesAfterItemOrderMode({
        data: previousData,
        nextItemOrderMode,
      }),
    );

    if (!previousKeys.has(JSON.stringify(nextKey))) {
      createdKeys.push(nextKey);
    }
  }

  return { previousEntries, createdKeys };
}

export async function optimisticallyReorderWatchlistItems({
  queryClient,
  watchlistId,
  itemIds,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  itemIds: number[];
}): Promise<WatchlistDetailCacheSnapshot> {
  const queryKey = watchlistDetailQueryFamily(watchlistId);

  await queryClient.cancelQueries({ queryKey });
  const snapshot = queryClient.getQueriesData<InfiniteData<WatchlistDetailPage, number>>({
    queryKey,
  });

  for (const [cacheKey, previousData] of snapshot) {
    const filters = readFiltersFromDetailQueryKey(cacheKey);

    if (!isFullCustomWatchlistDetailQuery(filters)) {
      continue;
    }

    queryClient.setQueryData(
      cacheKey,
      updateWatchlistDetailPagesAfterReorder({
        data: previousData,
        itemIds,
      }),
    );
  }

  return snapshot;
}

export function rollbackWatchedToggle({
  queryClient,
  snapshot,
}: {
  queryClient: QueryClient;
  snapshot: WatchlistDetailCacheSnapshot | undefined;
}) {
  for (const [cacheKey, previousData] of snapshot ?? []) {
    queryClient.setQueryData(cacheKey, previousData);
  }
}

export function rollbackWatchlistItemOrderMode({
  queryClient,
  snapshot,
}: {
  queryClient: QueryClient;
  snapshot: WatchlistDetailItemOrderModeSnapshot | undefined;
}) {
  for (const createdKey of snapshot?.createdKeys ?? []) {
    queryClient.removeQueries({ queryKey: createdKey, exact: true });
  }

  for (const [cacheKey, previousData] of snapshot?.previousEntries ?? []) {
    queryClient.setQueryData(cacheKey, previousData);
  }
}

export function rollbackWatchlistReorder({
  queryClient,
  snapshot,
}: {
  queryClient: QueryClient;
  snapshot: WatchlistDetailCacheSnapshot | undefined;
}) {
  for (const [cacheKey, previousData] of snapshot ?? []) {
    queryClient.setQueryData(cacheKey, previousData);
  }
}

export function invalidateWatchlistQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["watchlists"] });
}
