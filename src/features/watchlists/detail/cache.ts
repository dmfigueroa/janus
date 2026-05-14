import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailPage } from "@/models/watchlist";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";
import {
  watchlistDetailQueryFamily,
  watchlistDetailQueryKey,
  normalizeFiltersFromDetailQueryKey,
  readFiltersFromDetailQueryKey,
} from "@/features/watchlists/detail/query";
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
  const snapshot = await snapshotWatchlistDetailCache({
    queryClient,
    watchlistId,
  });
  const toggledItem = findWatchlistDetailItem(snapshot, itemId);

  for (const [cacheKey, previousData] of snapshot) {
    const filters = readFiltersFromDetailQueryKey(cacheKey);

    queryClient.setQueryData(
      cacheKey,
      updateWatchlistDetailPagesAfterToggle({
        data: previousData,
        itemId,
        previousIsWatched,
        nextIsWatched,
        pageSize: filters?.pageSize,
        toggledItem,
        searchQuery: filters?.query,
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
  nextItemOrderMode: WatchlistItemOrderMode;
}): Promise<WatchlistDetailItemOrderModeSnapshot> {
  const previousEntries = await snapshotWatchlistDetailCache({
    queryClient,
    watchlistId,
  });
  const createdKeys = copyEntriesToItemOrderModeCache({
    queryClient,
    watchlistId,
    previousEntries,
    nextItemOrderMode,
  });

  return { previousEntries, createdKeys };
}

async function snapshotWatchlistDetailCache({
  queryClient,
  watchlistId,
}: {
  queryClient: QueryClient;
  watchlistId: number;
}) {
  const queryKey = watchlistDetailQueryFamily(watchlistId);

  await queryClient.cancelQueries({ queryKey });

  return queryClient.getQueriesData<InfiniteData<WatchlistDetailPage, number>>({
    queryKey,
  });
}

function copyEntriesToItemOrderModeCache({
  queryClient,
  watchlistId,
  previousEntries,
  nextItemOrderMode,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  previousEntries: WatchlistDetailCacheSnapshot;
  nextItemOrderMode: WatchlistItemOrderMode;
}) {
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

  return createdKeys;
}

function findWatchlistDetailItem(
  snapshot: WatchlistDetailCacheSnapshot,
  itemId: WatchlistItem["id"],
) {
  for (const [, previousData] of snapshot) {
    const item = previousData?.pages
      .flatMap((page) => page.items)
      .find((entry) => entry.id === itemId);

    if (item) {
      return item;
    }
  }

  return null;
}

export async function optimisticallyReorderWatchlistItems({
  queryClient,
  watchlistId,
  activeQueryKey,
  movedItemId,
  referenceItemId,
  position,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  activeQueryKey: QueryKey;
  movedItemId: number;
  referenceItemId: number;
  position: "before" | "after";
}): Promise<WatchlistDetailCacheSnapshot> {
  const snapshot = await snapshotWatchlistDetailCache({
    queryClient,
    watchlistId,
  });

  const activeEntry = snapshot.find(
    ([cacheKey]) => JSON.stringify(cacheKey) === JSON.stringify(activeQueryKey),
  );

  if (activeEntry) {
    queryClient.setQueryData(
      activeQueryKey,
      updateWatchlistDetailPagesAfterReorder({
        data: activeEntry[1],
        movedItemId,
        referenceItemId,
        position,
      }),
    );
  }

  return snapshot;
}

export function restoreWatchlistDetailSnapshot({
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
