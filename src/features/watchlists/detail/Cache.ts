import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailPage } from "./Query";
import {
  watchlistDetailQueryFamily,
  readFiltersFromDetailQueryKey,
} from "@/features/watchlists/detail/Query";
import {
  updateWatchlistDetailPagesAfterItemRemoval,
  updateWatchlistDetailPagesAfterParentRemoval,
  updateWatchlistDetailPagesAfterToggle,
  updateWatchlistDetailPagesAfterReorder,
} from "@/features/watchlists/detail/Transform";

export type WatchlistDetailCacheSnapshot = Array<
  [QueryKey, InfiniteData<WatchlistDetailPage, number> | undefined]
>;

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

export async function optimisticallyRemoveWatchlistItem({
  queryClient,
  watchlistId,
  activeQueryKey,
  itemId,
  removedCount,
  watchedCount,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  activeQueryKey: QueryKey;
  itemId: WatchlistItem["id"];
  removedCount: number;
  watchedCount: number;
}): Promise<WatchlistDetailCacheSnapshot> {
  const snapshot = await snapshotActiveWatchlistDetailCache({
    queryClient,
    watchlistId,
    activeQueryKey,
  });

  const activeEntry = snapshot[0];

  if (activeEntry) {
    queryClient.setQueryData(
      activeQueryKey,
      updateWatchlistDetailPagesAfterItemRemoval({
        data: activeEntry[1],
        itemId,
        removedCount,
        watchedCount,
      }),
    );
  }

  return snapshot;
}

export async function optimisticallyRemoveWatchlistParent({
  queryClient,
  watchlistId,
  activeQueryKey,
  parentId,
  removedCount,
  watchedCount,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  activeQueryKey: QueryKey;
  parentId: string;
  removedCount: number;
  watchedCount: number;
}): Promise<WatchlistDetailCacheSnapshot> {
  const snapshot = await snapshotActiveWatchlistDetailCache({
    queryClient,
    watchlistId,
    activeQueryKey,
  });

  const activeEntry = snapshot[0];

  if (activeEntry) {
    queryClient.setQueryData(
      activeQueryKey,
      updateWatchlistDetailPagesAfterParentRemoval({
        data: activeEntry[1],
        parentId,
        removedCount,
        watchedCount,
      }),
    );
  }

  return snapshot;
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

async function snapshotActiveWatchlistDetailCache({
  queryClient,
  watchlistId,
  activeQueryKey,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  activeQueryKey: QueryKey;
}) {
  await queryClient.cancelQueries({ queryKey: watchlistDetailQueryFamily(watchlistId) });

  return [
    [
      activeQueryKey,
      queryClient.getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeQueryKey),
    ],
  ] satisfies WatchlistDetailCacheSnapshot;
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
