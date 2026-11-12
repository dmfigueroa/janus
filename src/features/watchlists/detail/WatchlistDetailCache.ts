import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistDetailPage } from "./Query";
import {
  readFiltersFromDetailQueryKey,
  watchlistDetailQueryFamily,
  type WatchlistDetailQueryKeyFilters,
} from "./Query";
import {
  updateWatchlistDetailPagesAfterItemRemoval,
  updateWatchlistDetailPagesAfterParentRemoval,
  updateWatchlistDetailPagesAfterToggle,
  type WatchlistDetailRemovalCounts,
} from "./WatchlistDetailOptimisticUpdate";
import { updateWatchlistDetailPagesAfterReorder } from "./WatchlistDetailReorder";

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
  return updateWatchlistDetailCache({
    queryClient,
    watchlistId,
    updateData: ({ data, filters }) =>
      updateWatchlistDetailPagesAfterToggle({
        data,
        itemId,
        previousIsWatched,
        nextIsWatched,
        removeWatchedFromUnwatchedOnly: filters?.unwatchedOnly === true,
      }),
  });
}

export async function optimisticallyRemoveWatchlistItem({
  queryClient,
  watchlistId,
  itemId,
  ...counts
}: {
  queryClient: QueryClient;
  watchlistId: number;
  itemId: WatchlistItem["id"];
} & WatchlistDetailRemovalCounts): Promise<WatchlistDetailCacheSnapshot> {
  return updateWatchlistDetailCache({
    queryClient,
    watchlistId,
    updateData: ({ data }) =>
      updateWatchlistDetailPagesAfterItemRemoval({ data, itemId, ...counts }),
  });
}

export async function optimisticallyRemoveWatchlistParent({
  queryClient,
  watchlistId,
  parentId,
  ...counts
}: {
  queryClient: QueryClient;
  watchlistId: number;
  parentId: string;
} & WatchlistDetailRemovalCounts): Promise<WatchlistDetailCacheSnapshot> {
  return updateWatchlistDetailCache({
    queryClient,
    watchlistId,
    updateData: ({ data }) =>
      updateWatchlistDetailPagesAfterParentRemoval({ data, parentId, ...counts }),
  });
}

export async function optimisticallyReorderWatchlistItems({
  queryClient,
  watchlistId,
  activeQueryKey,
  ...intent
}: {
  queryClient: QueryClient;
  watchlistId: number;
  activeQueryKey: QueryKey;
  movedItemId: number;
  referenceItemId: number;
  position: "before" | "after";
}): Promise<WatchlistDetailCacheSnapshot> {
  const snapshot = await snapshotWatchlistDetailCache({ queryClient, watchlistId });
  const activeData =
    queryClient.getQueryData<InfiniteData<WatchlistDetailPage, number>>(activeQueryKey);

  if (activeData) {
    queryClient.setQueryData(
      activeQueryKey,
      updateWatchlistDetailPagesAfterReorder({ data: activeData, ...intent }),
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
  snapshot?.forEach(([cacheKey, previousData]) => {
    queryClient.setQueryData(cacheKey, previousData);
  });
}

async function updateWatchlistDetailCache({
  queryClient,
  watchlistId,
  updateData,
}: {
  queryClient: QueryClient;
  watchlistId: number;
  updateData: (entry: {
    data: InfiniteData<WatchlistDetailPage, number> | undefined;
    filters: Partial<WatchlistDetailQueryKeyFilters> | null;
  }) => InfiniteData<WatchlistDetailPage, number> | undefined;
}) {
  const snapshot = await snapshotWatchlistDetailCache({ queryClient, watchlistId });

  snapshot.forEach(([cacheKey, data]) => {
    queryClient.setQueryData(
      cacheKey,
      updateData({ data, filters: readFiltersFromDetailQueryKey(cacheKey) }),
    );
  });

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

  return queryClient.getQueriesData<InfiniteData<WatchlistDetailPage, number>>({ queryKey });
}
