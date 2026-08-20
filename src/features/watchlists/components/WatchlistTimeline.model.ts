import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";

export interface WatchlistTimelineGroup {
  year: string;
  items: WatchlistItem[];
}

export function buildWatchlistTimelineGroups(
  items: WatchlistItem[],
  itemOrderMode: WatchlistItemOrderMode,
): WatchlistTimelineGroup[] {
  if (itemOrderMode === "custom") {
    return [{ year: "custom", items }];
  }

  const grouped: WatchlistTimelineGroup[] = [];
  let currentYear = "";
  let currentGroup: WatchlistItem[] = [];

  items.forEach((item) => {
    const year = getReleaseYear(item);
    const nextGroup = appendTimelineItem(grouped, currentYear, currentGroup, year, item);
    currentYear = nextGroup.year;
    currentGroup = nextGroup.items;
  });

  if (currentGroup.length > 0) {
    grouped.push({ year: currentYear, items: currentGroup });
  }

  return grouped;
}

export function reorderItemsByIds(items: WatchlistItem[], itemIds: number[]) {
  if (
    areItemIdsEqual(
      items.map((item) => item.id),
      itemIds,
    )
  ) {
    return items;
  }

  const rankByItemId = new Map(itemIds.map((itemId, index) => [itemId, index]));
  const originalIndexByItemId = new Map(items.map((item, index) => [item.id, index]));

  return [...items].sort(
    (left, right) =>
      getItemRank(left.id, rankByItemId, originalIndexByItemId, itemIds.length) -
      getItemRank(right.id, rankByItemId, originalIndexByItemId, itemIds.length),
  );
}

function getReleaseYear(item: WatchlistItem) {
  return item.releaseDate ? item.releaseDate.split("-")[0] : "TBA";
}

function appendTimelineItem(
  grouped: WatchlistTimelineGroup[],
  currentYear: string,
  currentItems: WatchlistItem[],
  itemYear: string,
  item: WatchlistItem,
) {
  if (itemYear === currentYear) {
    return { year: currentYear, items: [...currentItems, item] };
  }

  appendCompletedGroup(grouped, currentYear, currentItems);
  return { year: itemYear, items: [item] };
}

function appendCompletedGroup(
  grouped: WatchlistTimelineGroup[],
  year: string,
  items: WatchlistItem[],
) {
  if (items.length > 0) {
    grouped.push({ year, items });
  }
}

function getItemRank(
  itemId: number,
  rankByItemId: Map<number, number>,
  originalIndexByItemId: Map<number, number>,
  orderedItemCount: number,
) {
  const rank = rankByItemId.get(itemId);
  if (rank !== undefined) {
    return rank;
  }

  return orderedItemCount + (originalIndexByItemId.get(itemId) ?? 0);
}

export function shouldResetOptimisticOrder(itemIds: number[], localOrderIds: number[] | null) {
  if (!localOrderIds) {
    return false;
  }

  return areItemIdsEqual(itemIds, localOrderIds) || !haveSameItemSet(itemIds, localOrderIds);
}

function areItemIdsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}

function haveSameItemSet(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);
  return left.every((itemId) => rightIds.has(itemId));
}
