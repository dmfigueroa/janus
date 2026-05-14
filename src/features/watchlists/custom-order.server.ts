import type { WatchlistItem } from "@/db/schema";
import { compareItemsByOrderMode, type WatchlistItemOrderMode } from "@/features/watchlists/order";

type OrderedWatchlistItems = {
  itemOrderMode: WatchlistItemOrderMode;
  items: WatchlistItem[];
};

export function hasCustomOrderedItems(items: OrderedWatchlistItems[]) {
  return items.some((entry) => entry.itemOrderMode === "custom");
}

export function buildMergedCustomSequence({
  target,
  sources,
}: {
  target?: OrderedWatchlistItems;
  sources: OrderedWatchlistItems[];
}) {
  const mergedItemsByKey = new Map<string, WatchlistItem>();
  const orderedItems: WatchlistItem[] = [];

  for (const entry of [target, ...sources]) {
    if (!entry) {
      continue;
    }

    for (const item of sortWatchlistItems(entry.items, entry.itemOrderMode)) {
      const key = getWatchlistItemMergeKey(item);
      const existing = mergedItemsByKey.get(key);

      if (existing) {
        existing.isWatched = existing.isWatched || item.isWatched;
        continue;
      }

      const nextItem = { ...item };
      mergedItemsByKey.set(key, nextItem);
      orderedItems.push(nextItem);
    }
  }

  return orderedItems.map((item, index) => ({
    ...item,
    customRank: index + 1,
  }));
}

export function getWatchlistItemMergeKey(item: Pick<WatchlistItem, "tmdbId" | "mediaType">) {
  return `${item.mediaType}:${item.tmdbId}`;
}

function sortWatchlistItems(items: WatchlistItem[], itemOrderMode: WatchlistItemOrderMode) {
  return [...items].sort((left, right) => compareItemsByOrderMode(left, right, itemOrderMode));
}
