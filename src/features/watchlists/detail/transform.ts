import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/schema";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import { reorderVisibleItemsByAnchor } from "@/features/watchlists/detail/reorder";
import { compareItemsByOrderMode, type WatchlistItemOrderMode } from "@/features/watchlists/order";
import type { WatchlistDetailPage } from "@/models/watchlist";

export type WatchlistDetailToggleParams = {
  itemId: WatchlistItem["id"];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  pageSize?: number;
  toggledItem?: WatchlistItem | null;
  searchQuery?: string;
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
    pages: repartitionItemsAcrossPages({
      pages: data.pages.map((page) =>
        updateWatchlistDetailPageAfterToggle(page, {
          ...toggle,
          nextIsWatched,
          watchedDelta,
        }),
      ),
      pageSize: toggle.pageSize,
      items: updateVisibleWatchlistItemsAfterToggle({
        items: getWatchlistItemsFromPages(data.pages),
        itemOrderMode: data.pages[0]?.watchlist.itemOrderMode ?? "release",
        previousIsWatched,
        ...toggle,
        nextIsWatched,
      }),
    }),
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

  const items = sortWatchlistItemsByOrderMode(getWatchlistItemsFromPages(data.pages), {
    itemOrderMode: nextItemOrderMode,
  });
  const pages = updateWatchlistPagesItemOrderMode(data.pages, nextItemOrderMode);

  return {
    ...data,
    pages: repartitionItemsAcrossPages({
      pages,
      items,
    }),
  };
}

export function updateWatchlistDetailPagesAfterReorder({
  data,
  movedItemId,
  referenceItemId,
  position,
}: {
  data: InfiniteData<WatchlistDetailPage, number> | undefined;
  movedItemId: number;
  referenceItemId: number;
  position: "before" | "after";
}) {
  if (!data) {
    return data;
  }

  const reorderedIds = reorderVisibleItemsByAnchor({
    items: getWatchlistItemsFromPages(data.pages),
    movedItemId,
    referenceItemId,
    position,
  });

  if (!reorderedIds) {
    return data;
  }

  const items = sortWatchlistItemsByOrderMode(
    updateWatchlistItemsCustomRanks(getWatchlistItemsFromPages(data.pages), reorderedIds),
    { itemOrderMode: "custom" },
  );

  return {
    ...data,
    pages: repartitionItemsAcrossPages({
      pages: data.pages,
      items,
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

function updateWatchlistDetailPageAfterToggle(
  page: WatchlistDetailPage,
  {
    watchedDelta,
    itemId,
  }: WatchlistDetailItemToggleParams & {
    watchedDelta: number;
  },
) {
  return {
    ...page,
    watchlist: updateWatchlistStatsAfterToggle(page.watchlist, watchedDelta),
    items: page.items.map((item) => (item.id === itemId ? { ...item } : item)),
  };
}

function updateVisibleWatchlistItemsAfterToggle({
  itemOrderMode,
  previousIsWatched,
  searchQuery,
  toggledItem,
  ...toggle
}: {
  items: WatchlistDetailPage["items"];
  itemOrderMode: WatchlistItemOrderMode;
} & WatchlistDetailToggleParams) {
  let nextItems = updateExistingWatchlistItemsAfterToggle(toggle.items, toggle);

  if (toggle.removeWatchedFromUnwatchedOnly && toggle.nextIsWatched) {
    nextItems = nextItems.filter((item) => item.id !== toggle.itemId);
  }

  if (
    shouldInsertToggledItemAfterToggle({
      items: nextItems,
      previousIsWatched,
      nextIsWatched: toggle.nextIsWatched,
      removeWatchedFromUnwatchedOnly: toggle.removeWatchedFromUnwatchedOnly,
      toggledItem,
      searchQuery,
    })
  ) {
    nextItems = [...nextItems, { ...toggledItem!, isWatched: toggle.nextIsWatched }];
  }

  return sortWatchlistItemsByOrderMode(nextItems, { itemOrderMode });
}

function updateExistingWatchlistItemsAfterToggle(
  items: WatchlistDetailPage["items"],
  { itemId, nextIsWatched }: WatchlistDetailItemToggleParams,
) {
  return items.map((item) => (item.id === itemId ? { ...item, isWatched: nextIsWatched } : item));
}

function shouldInsertToggledItemAfterToggle({
  items,
  previousIsWatched,
  nextIsWatched,
  removeWatchedFromUnwatchedOnly,
  toggledItem,
  searchQuery,
}: {
  items: WatchlistItem[];
  previousIsWatched: boolean;
  nextIsWatched: boolean;
  removeWatchedFromUnwatchedOnly?: boolean;
  toggledItem?: WatchlistItem | null;
  searchQuery?: string;
}) {
  if (!removeWatchedFromUnwatchedOnly || !previousIsWatched || nextIsWatched || !toggledItem) {
    return false;
  }

  if (items.some((item) => item.id === toggledItem.id)) {
    return false;
  }

  return matchesWatchlistItemQuery(toggledItem, searchQuery);
}

function matchesWatchlistItemQuery(item: WatchlistItem, query?: string) {
  const normalizedQuery = query?.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [item.title, item.parentTitle, item.episode].some((value) =>
    value?.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function updateWatchlistPagesItemOrderMode(
  pages: InfiniteData<WatchlistDetailPage, number>["pages"],
  itemOrderMode: WatchlistItemOrderMode,
) {
  return pages.map((page) => ({
    ...page,
    watchlist: {
      ...page.watchlist,
      itemOrderMode,
    },
  }));
}

function getWatchlistItemsFromPages(pages: InfiniteData<WatchlistDetailPage, number>["pages"]) {
  return pages.flatMap((page) => page.items);
}

function updateWatchlistItemsCustomRanks(items: WatchlistItem[], itemIds: number[]) {
  const rankByItemId = createRankByItemId(itemIds);

  return items.map((item) => ({
    ...item,
    customRank: rankByItemId.get(item.id) ?? item.customRank,
  }));
}

function createRankByItemId(itemIds: number[]) {
  return new Map(itemIds.map((itemId, index) => [itemId, index + 1]));
}

function sortWatchlistItemsByOrderMode(
  items: WatchlistItem[],
  { itemOrderMode }: { itemOrderMode: WatchlistItemOrderMode },
) {
  return [...items].sort((left, right) => compareItemsByOrderMode(left, right, itemOrderMode));
}

function repartitionItemsAcrossPages({
  pages,
  items,
  pageSize,
}: {
  pages: InfiniteData<WatchlistDetailPage, number>["pages"];
  items: WatchlistItem[];
  pageSize?: number;
}) {
  let offset = 0;

  return pages.map((page) => {
    const nextOffset = offset + (pageSize ?? page.items.length);
    const nextPageItems = items.slice(offset, nextOffset);
    offset = nextOffset;

    return {
      ...page,
      items: nextPageItems,
    };
  });
}
