import type { WatchlistItem } from "@/db/schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

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
    const year = item.releaseDate ? item.releaseDate.split("-")[0] : "TBA";

    if (year !== currentYear) {
      if (currentGroup.length > 0) {
        grouped.push({ year: currentYear, items: currentGroup });
      }

      currentYear = year;
      currentGroup = [item];
      return;
    }

    currentGroup.push(item);
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

  return [...items].sort((left, right) => {
    const leftRank = rankByItemId.get(left.id);
    const rightRank = rankByItemId.get(right.id);

    if (leftRank === undefined && rightRank === undefined) {
      return (originalIndexByItemId.get(left.id) ?? 0) - (originalIndexByItemId.get(right.id) ?? 0);
    }

    if (leftRank === undefined) {
      return 1;
    }

    if (rightRank === undefined) {
      return -1;
    }

    return leftRank - rightRank;
  });
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
