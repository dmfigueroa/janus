import {
  infiniteQueryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WatchlistItem } from "@/db/schema";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";

export type WatchlistItemOrderMode = "release" | "custom";

const watchlistDetailFiltersSchema = z.object({
  watchlistId: z.coerce.number(),
  pageSize: z.number().optional().default(50),
  query: z.string().optional(),
  unwatchedOnly: z.boolean().optional().default(false),
  itemOrderMode: z.enum(["release", "custom"]).optional().default("release"),
});

export type WatchlistDetailQueryFilters = z.input<typeof watchlistDetailFiltersSchema>;
export type WatchlistDetailQueryData = WatchlistDetailPage;

const watchlistDetailPageSchema = watchlistDetailFiltersSchema.extend({
  cursor: z.number().optional().default(1),
});

function normalizeWatchlistDetailFilters(filters: WatchlistDetailQueryFilters) {
  return watchlistDetailFiltersSchema.parse(filters);
}

export function watchlistDetailQueryFamily(watchlistId: number) {
  return ["watchlists", "detail", watchlistId] as const;
}

export function watchlistDetailQueryKey(filters: WatchlistDetailQueryFilters) {
  const normalized = normalizeWatchlistDetailFilters(filters);

  return [
    ...watchlistDetailQueryFamily(normalized.watchlistId),
    {
      itemOrderMode: normalized.itemOrderMode,
      pageSize: normalized.pageSize,
      query: normalized.query ?? "",
      unwatchedOnly: normalized.unwatchedOnly,
    },
  ] as const;
}

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

export const getWatchlistDetailPage = createServerFn()
  .inputValidator((data) => watchlistDetailPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { getWatchlistDetail } = await import("./query.server");
    return getWatchlistDetail(data);
  });

export function watchlistDetailInfiniteQueryOptions(filters: WatchlistDetailQueryFilters) {
  const normalized = normalizeWatchlistDetailFilters(filters);

  return infiniteQueryOptions({
    queryKey: watchlistDetailQueryKey(normalized),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const detail = await getWatchlistDetailPage({
        data: { ...normalized, cursor: pageParam },
      });

      if (!detail) {
        throw new Error("Watchlist not found");
      }

      return detail;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
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
    pages: data.pages.map((page) => {
      return {
        ...page,
        watchlist: updateWatchlistStatsAfterToggle(page.watchlist, watchedDelta),
        items: updateWatchlistItemsAfterToggle(page.items, { ...toggle, nextIsWatched }),
      };
    }),
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

function compareReleaseDates(
  left: Pick<WatchlistItem, "id" | "releaseDate">,
  right: Pick<WatchlistItem, "id" | "releaseDate">,
) {
  const leftReleaseDate = left.releaseDate?.trim() || null;
  const rightReleaseDate = right.releaseDate?.trim() || null;

  if (leftReleaseDate === null && rightReleaseDate === null) {
    return left.id - right.id;
  }

  if (leftReleaseDate === null) {
    return 1;
  }

  if (rightReleaseDate === null) {
    return -1;
  }

  return leftReleaseDate.localeCompare(rightReleaseDate) || left.id - right.id;
}

function compareItemsByOrderMode(
  left: WatchlistItem,
  right: WatchlistItem,
  itemOrderMode: WatchlistItemOrderMode,
) {
  if (itemOrderMode === "custom") {
    const leftRank = left.customRank;
    const rightRank = right.customRank;

    if (leftRank === null && rightRank === null) {
      return compareReleaseDates(left, right);
    }

    if (leftRank === null) {
      return 1;
    }

    if (rightRank === null) {
      return -1;
    }

    return leftRank - rightRank || compareReleaseDates(left, right);
  }

  return compareReleaseDates(left, right);
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
