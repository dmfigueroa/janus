import type { InfiniteData } from "@tanstack/react-query";
import type { WatchlistItem } from "@/db/Schema";
import { compareItemsByOrderMode, type WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { reorderVisibleItemsByAnchor } from "./Reorder";
import type { WatchlistDetailPage } from "./Query";

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
