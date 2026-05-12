import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import { compareItemsByOrderMode, type WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { WatchlistDetailPage } from "@/models/watchlist";

export type WatchlistDetailToggleParams = {
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  removeWatchedFromUnwatchedOnly?: boolean;
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
    pages: data.pages.map((page) => ({
      ...page,
      watchlist: updateWatchlistStatsAfterToggle(page.watchlist, watchedDelta),
      items: updateWatchlistItemsAfterToggle(page.items, { ...toggle, nextIsWatched }),
    })),
  };
}

export function updateWatchlistDetailPagesAfterItemOrderMode({
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

export function updateWatchlistDetailPagesAfterReorder({
  data,
  itemIds,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  itemIds: number[];
}) {
  if (!data) {
    return data;
  }

  const rankByItemId = new Map(itemIds.map((itemId, index) => [itemId, index + 1]));
  const reorderedItems = data.pages
    .flatMap((page) => page.items)
    .map((item) => ({
      ...item,
      customRank: rankByItemId.get(item.id) ?? item.customRank,
    }))
    .sort((left, right) => compareItemsByOrderMode(left, right, "custom"));

  return {
    ...data,
    pages: repartitionItemsAcrossPages({
      pages: data.pages,
      items: reorderedItems,
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
