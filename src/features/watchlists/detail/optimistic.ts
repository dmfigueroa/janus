import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import { compareItemsByOrderMode, type WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { WatchlistDetailPage } from "@/models/watchlist";
import {
  type WatchlistDetailQueryFilters,
  watchlistDetailQueryFamily,
  watchlistDetailQueryKey,
} from "@/features/watchlists/detail/query";

type WatchlistDetailQueryKeyFilters = ReturnType<typeof watchlistDetailQueryKey>[3];

export type WatchlistDetailCacheSnapshot = Array<
  [QueryKey, InfiniteData<WatchlistDetailPage, number> | undefined]
>;
export type WatchlistDetailItemOrderModeSnapshot = {
  previousEntries: WatchlistDetailCacheSnapshot;
  createdKeys: QueryKey[];
};
type WatchlistDetailToggleParams = {
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  removeWatchedFromUnwatchedOnly?: boolean;
};
type WatchlistDetailItemToggleParams = Omit<WatchlistDetailToggleParams, "previousIsWatched">;

function normalizeWatchlistDetailFilters(filters: WatchlistDetailQueryFilters) {
  return {
    watchlistId: Number(filters.watchlistId),
    pageSize: filters.pageSize ?? 50,
    query: filters.query,
    unwatchedOnly: filters.unwatchedOnly ?? false,
    itemOrderMode: filters.itemOrderMode ?? "release",
  } satisfies {
    watchlistId: number;
    pageSize: number;
    query?: string;
    unwatchedOnly: boolean;
    itemOrderMode: WatchlistItemOrderMode;
  };
}

export function updateWatchlistDetailPagesAfterToggle({
  data,
  previousIsWatched,
  nextIsWatched,
  ...toggle
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
} & WatchlistDetailToggleParams) {
  if (!data) {
    return data;
  }

  const watchedDelta = calculateWatchedDelta({ previousIsWatched, nextIsWatched });

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      watchlist: updateWatchlistStatsAfterToggle(page.watchlist, watchedDelta),
      items: updateWatchlistItemsAfterToggle(page.items, { ...toggle, nextIsWatched }),
    })),
  };
}

function calculateWatchedDelta({
  previousIsWatched,
  nextIsWatched,
}: Pick<WatchlistDetailToggleParams, "previousIsWatched" | "nextIsWatched">) {
  return previousIsWatched === nextIsWatched ? 0 : nextIsWatched ? 1 : -1;
}

function updateWatchlistStatsAfterToggle(
  watchlist: WatchlistDetailPage["watchlist"],
  watchedDelta: number,
) {
  const totalItems = watchlist.stats.totalItems;
  const watchedItems = Math.min(
    totalItems,
    Math.max(0, watchlist.stats.watchedItems + watchedDelta),
  );

  return {
    ...watchlist,
    stats: {
      ...watchlist.stats,
      watchedItems,
      progress: calculateWatchlistProgress({ totalItems, watchedItems }),
    },
  };
}

function updateWatchlistItemsAfterToggle(
  items: WatchlistDetailPage["items"],
  {
    itemId,
    nextIsWatched,
    removeWatchedFromUnwatchedOnly = false,
  }: WatchlistDetailItemToggleParams,
) {
  if (removeWatchedFromUnwatchedOnly && nextIsWatched) {
    return items.filter((item) => item.id !== itemId);
  }

  return items.map((item) => (item.id === itemId ? { ...item, isWatched: nextIsWatched } : item));
}

function repartitionItemsAcrossPages({
  pages,
  items,
}: {
  pages: InfiniteData<WatchlistDetailPage, number>["pages"];
  items: WatchlistItem[];
}) {
  let offset = 0;

  return pages.map((page) => {
    const nextOffset = offset + page.items.length;
    const nextPageItems = items.slice(offset, nextOffset);
    offset = nextOffset;

    return {
      ...page,
      items: nextPageItems,
    };
  });
}

function updateWatchlistDetailPagesAfterItemOrderMode({
  data,
  nextItemOrderMode,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  nextItemOrderMode: WatchlistItemOrderMode;
}) {
  if (!data) {
    return data;
  }

  const reorderedItems = data.pages
    .flatMap((page) => page.items)
    .sort((left, right) => compareItemsByOrderMode(left, right, nextItemOrderMode));

  return {
    ...data,
    pages: repartitionItemsAcrossPages({
      pages: data.pages.map((page) => ({
        ...page,
        watchlist: {
          ...page.watchlist,
          itemOrderMode: nextItemOrderMode,
        },
      })),
      items: reorderedItems,
    }),
  };
}

function readFiltersFromDetailQueryKey(queryKey: QueryKey) {
  const filters = queryKey[3];

  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return null;
  }

  return filters as Partial<WatchlistDetailQueryKeyFilters>;
}

function normalizeFiltersFromDetailQueryKey(queryKey: QueryKey, watchlistId: number) {
  const filters = readFiltersFromDetailQueryKey(queryKey);

  if (!filters) {
    return null;
  }

  return normalizeWatchlistDetailFilters({
    watchlistId,
    pageSize: filters.pageSize,
    query: filters.query,
    unwatchedOnly: filters.unwatchedOnly,
    itemOrderMode: filters.itemOrderMode,
  });
}

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

export function invalidateWatchlistQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["watchlists"] });
}
