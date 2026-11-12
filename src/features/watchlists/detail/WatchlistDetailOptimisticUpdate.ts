import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/Schema";
import { compareItemsByOrderMode } from "@/features/watchlists/Order";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";
import type { WatchlistDetailPage } from "./Query";

type WatchlistDetailCounts = {
  totalItems: number;
  watchedItems: number;
};

export type WatchlistDetailRemovalCounts = {
  removedCount: number;
  watchedCount: number;
};

export function updateWatchlistDetailPagesAfterToggle({
  data,
  itemId,
  previousIsWatched,
  nextIsWatched,
  removeWatchedFromUnwatchedOnly,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  removeWatchedFromUnwatchedOnly: boolean;
}) {
  const watchedDelta = calculateWatchedDelta({ previousIsWatched, nextIsWatched });

  return updateWatchlistDetailPages({
    data,
    updateItems: (items) =>
      updateItemsAfterToggle(items, {
        itemId,
        nextIsWatched,
        removeWatchedFromUnwatchedOnly,
      }),
    updateCounts: (stats) => ({
      totalItems: stats.totalItems,
      watchedItems: stats.watchedItems + watchedDelta,
    }),
  });
}

export function updateWatchlistDetailPagesAfterItemRemoval({
  data,
  itemId,
  ...counts
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  itemId: WatchlistItem["id"];
} & WatchlistDetailRemovalCounts) {
  return updateWatchlistDetailPagesAfterRemoval({
    data,
    ...counts,
    shouldRemove: (item) => item.id === itemId,
  });
}

export function updateWatchlistDetailPagesAfterParentRemoval({
  data,
  parentId,
  ...counts
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  parentId: string;
} & WatchlistDetailRemovalCounts) {
  return updateWatchlistDetailPagesAfterRemoval({
    data,
    ...counts,
    shouldRemove: (item) => item.parentId === parentId,
  });
}

function updateWatchlistDetailPagesAfterRemoval({
  data,
  removedCount,
  watchedCount,
  shouldRemove,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  shouldRemove: (item: WatchlistItem) => boolean;
} & WatchlistDetailRemovalCounts) {
  return updateWatchlistDetailPages({
    data,
    updateItems: (items) => items.filter((item) => !shouldRemove(item)),
    updateCounts: (stats) => ({
      totalItems: stats.totalItems - removedCount,
      watchedItems: stats.watchedItems - watchedCount,
    }),
  });
}

function updateWatchlistDetailPages({
  data,
  updateItems,
  updateCounts,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  updateItems: (items: WatchlistItem[]) => WatchlistItem[];
  updateCounts: (stats: WatchlistDetailPage["watchlist"]["stats"]) => WatchlistDetailCounts;
}) {
  if (!data) {
    return data;
  }

  const firstPage = data.pages[0];

  if (!firstPage) {
    return data;
  }

  return refreshWatchlistDetailPages({ data, firstPage, updateItems, updateCounts });
}

function refreshWatchlistDetailPages({
  data,
  firstPage,
  updateItems,
  updateCounts,
}: {
  data: InfiniteData<WatchlistDetailPage, number>;
  firstPage: WatchlistDetailPage;
  updateItems: (items: WatchlistItem[]) => WatchlistItem[];
  updateCounts: (stats: WatchlistDetailPage["watchlist"]["stats"]) => WatchlistDetailCounts;
}) {
  const pages = data.pages.map((page) => ({
    ...page,
    items: updateItems(page.items),
  }));
  const items = pages.flatMap((page) => page.items);
  const counts = normalizeWatchlistDetailCounts(updateCounts(firstPage.watchlist.stats));
  const watchlist = updateWatchlistDetailStats(firstPage.watchlist, items, counts);

  return {
    ...data,
    pages: pages.map((page) => ({ ...page, watchlist })),
  };
}

function updateWatchlistDetailStats(
  watchlist: WatchlistDetailPage["watchlist"],
  items: WatchlistItem[],
  counts: WatchlistDetailCounts,
): WatchlistDetailPage["watchlist"] {
  return {
    ...watchlist,
    stats: {
      ...watchlist.stats,
      totalItems: counts.totalItems,
      watchedItems: counts.watchedItems,
      progress: calculateWatchlistProgress(counts),
      nextUnwatched: findNextUnwatchedItem(items, watchlist.itemOrderMode),
    },
  };
}

function normalizeWatchlistDetailCounts({
  totalItems,
  watchedItems,
}: WatchlistDetailCounts): WatchlistDetailCounts {
  const normalizedTotal = Math.max(0, totalItems);

  return {
    totalItems: normalizedTotal,
    watchedItems: Math.min(normalizedTotal, Math.max(0, watchedItems)),
  };
}

function findNextUnwatchedItem(
  items: WatchlistItem[],
  itemOrderMode: WatchlistDetailPage["watchlist"]["itemOrderMode"],
) {
  return items
    .filter((item) => !item.isWatched)
    .reduce<WatchlistItem | null>(
      (nextItem, item) =>
        nextItem && compareItemsByOrderMode(item, nextItem, itemOrderMode) >= 0 ? nextItem : item,
      null,
    );
}

function calculateWatchedDelta({
  previousIsWatched,
  nextIsWatched,
}: {
  previousIsWatched: boolean;
  nextIsWatched: boolean;
}) {
  if (previousIsWatched === nextIsWatched) {
    return 0;
  }

  return nextIsWatched ? 1 : -1;
}

function updateItemsAfterToggle(
  items: WatchlistItem[],
  {
    itemId,
    nextIsWatched,
    removeWatchedFromUnwatchedOnly,
  }: {
    itemId: WatchlistItem["id"];
    nextIsWatched: boolean;
    removeWatchedFromUnwatchedOnly: boolean;
  },
) {
  if (removeWatchedFromUnwatchedOnly && nextIsWatched) {
    return items.filter((item) => item.id !== itemId);
  }

  return items.map((item) => (item.id === itemId ? { ...item, isWatched: nextIsWatched } : item));
}
