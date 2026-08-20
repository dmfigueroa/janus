import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/Schema";
import { calculateWatchlistProgress } from "@/features/watchlists/Progress";
import type { WatchlistDetailPage } from "./Query";

export { updateWatchlistDetailPagesAfterReorder } from "./WatchlistDetailReorder";

export type WatchlistDetailToggleParams = {
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  removeWatchedFromUnwatchedOnly?: boolean;
};

type WatchlistDetailRemovalStats = {
  removedCount: number;
  watchedCount: number;
};

type WatchlistDetailItemToggleParams = Omit<WatchlistDetailToggleParams, "previousIsWatched">;

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
    pages: data.pages.map((page) =>
      updateWatchlistDetailPageAfterToggle(page, {
        ...toggle,
        nextIsWatched,
        watchedDelta,
      }),
    ),
  };
}

export function updateWatchlistDetailPagesAfterItemRemoval({
  data,
  itemId,
  removedCount,
  watchedCount,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  itemId: WatchlistItem["id"];
} & WatchlistDetailRemovalStats) {
  return updateWatchlistDetailPagesAfterRemoval({
    data,
    removedCount,
    watchedCount,
    shouldRemove: (item) => item.id === itemId,
  });
}

export function updateWatchlistDetailPagesAfterParentRemoval({
  data,
  parentId,
  removedCount,
  watchedCount,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  parentId: string;
} & WatchlistDetailRemovalStats) {
  return updateWatchlistDetailPagesAfterRemoval({
    data,
    removedCount,
    watchedCount,
    shouldRemove: (item) => item.parentId === parentId,
  });
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

function updateWatchlistStatsAfterRemoval(
  watchlist: WatchlistDetailPage["watchlist"],
  { removedCount, watchedCount }: WatchlistDetailRemovalStats,
) {
  const totalItems = Math.max(0, watchlist.stats.totalItems - removedCount);
  const watchedItems = Math.min(
    totalItems,
    Math.max(0, watchlist.stats.watchedItems - watchedCount),
  );

  return {
    ...watchlist,
    stats: {
      ...watchlist.stats,
      totalItems,
      watchedItems,
      progress: calculateWatchlistProgress({ totalItems, watchedItems }),
    },
  };
}

function updateWatchlistDetailPageAfterToggle(
  page: WatchlistDetailPage,
  {
    watchedDelta,
    ...toggle
  }: WatchlistDetailItemToggleParams & {
    watchedDelta: number;
  },
) {
  return {
    ...page,
    watchlist: updateWatchlistStatsAfterToggle(page.watchlist, watchedDelta),
    items: updateWatchlistItemsAfterToggle(page.items, toggle),
  };
}

function updateWatchlistItemsAfterToggle(
  items: WatchlistDetailPage["items"],
  { itemId, nextIsWatched, removeWatchedFromUnwatchedOnly }: WatchlistDetailItemToggleParams,
) {
  if (shouldRemoveToggledItem(removeWatchedFromUnwatchedOnly, nextIsWatched)) {
    return items.filter((item) => item.id !== itemId);
  }

  return items.map((item) => (item.id === itemId ? { ...item, isWatched: nextIsWatched } : item));
}

function shouldRemoveToggledItem(removeWatched: boolean | undefined, nextIsWatched: boolean) {
  return removeWatched === true && nextIsWatched;
}

function updateWatchlistDetailPagesAfterRemoval({
  data,
  removedCount,
  watchedCount,
  shouldRemove,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  removedCount: number;
  watchedCount: number;
  shouldRemove: (item: WatchlistItem) => boolean;
}) {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      watchlist: updateWatchlistStatsAfterRemoval(page.watchlist, { removedCount, watchedCount }),
      items: page.items.filter((item) => !shouldRemove(item)),
    })),
  };
}
