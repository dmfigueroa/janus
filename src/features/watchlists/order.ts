import type { Watchlist } from "@/db/schema";
import type { WatchlistItem } from "@/db/schema";

export type WatchlistItemOrderMode = Watchlist["itemOrderMode"];

export type InsertionPosition = "beginning" | "end" | "release-adjacent";

type ItemWithOrder = {
  id?: number;
  tmdbId: string;
  mediaType: string;
  releaseDate: string | null;
  customRank: number | null;
};

type OrderedItem = ItemWithOrder & { newRank: number };

export function compareReleaseDates(
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

function compareNullableReleaseDates(left: string | null, right: string | null): number {
  const leftNorm = left?.trim() || null;
  const rightNorm = right?.trim() || null;

  if (leftNorm === null && rightNorm === null) return 0;
  if (leftNorm === null) return 1;
  if (rightNorm === null) return -1;

  return leftNorm.localeCompare(rightNorm);
}

export function compareItemsByOrderMode(
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

export function computeItemInsertionOrder(
  existingItems: ItemWithOrder[],
  newItem: ItemWithOrder,
  position: InsertionPosition,
  itemOrderMode: WatchlistItemOrderMode,
): OrderedItem[] {
  if (itemOrderMode === "release") {
    return [{ ...newItem, newRank: 1 }];
  }

  const sortedExisting = sortItemsByCustomOrder(existingItems);
  return positionItem(sortedExisting, newItem, position);
}

function sortItemsByCustomOrder(items: ItemWithOrder[]): ItemWithOrder[] {
  return [...items].sort((a, b) => {
    const rankA = a.customRank ?? Infinity;
    const rankB = b.customRank ?? Infinity;

    if (rankA !== rankB) return rankA - rankB;

    const releaseCompare = compareNullableReleaseDates(a.releaseDate, b.releaseDate);
    if (releaseCompare !== 0) return releaseCompare;

    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function positionItem(
  sorted: ItemWithOrder[],
  newItem: ItemWithOrder,
  position: InsertionPosition,
): OrderedItem[] {
  switch (position) {
    case "beginning":
      return positionAtBeginning(sorted, newItem);
    case "end":
      return positionAtEnd(sorted, newItem);
    case "release-adjacent":
      return positionReleaseAdjacent(sorted, newItem);
  }
}

function positionAtBeginning(sorted: ItemWithOrder[], newItem: ItemWithOrder): OrderedItem[] {
  const rankedNew = [{ ...newItem, newRank: 1 }];
  const rankedExisting = sorted
    .filter((item): item is ItemWithOrder & { id: number } => item.id !== undefined)
    .map((item, idx) => ({ ...item, newRank: rankedNew.length + idx + 1 }));
  return [...rankedNew, ...rankedExisting];
}

function positionAtEnd(sorted: ItemWithOrder[], newItem: ItemWithOrder): OrderedItem[] {
  const rankedExisting = sorted
    .filter((item): item is ItemWithOrder & { id: number } => item.id !== undefined)
    .map((item, idx) => ({ ...item, newRank: idx + 1 }));
  return [...rankedExisting, { ...newItem, newRank: rankedExisting.length + 1 }];
}

function positionReleaseAdjacent(sorted: ItemWithOrder[], newItem: ItemWithOrder): OrderedItem[] {
  const nextOrder: (ItemWithOrder | OrderedItem)[] = [...sorted];
  const insertionIndex = findReleaseAdjacentInsertionIndex(nextOrder, newItem);
  nextOrder.splice(insertionIndex, 0, newItem);
  return nextOrder.map((item, idx) => ({
    ...item,
    newRank: idx + 1,
  }));
}

function findReleaseAdjacentInsertionIndex(
  currentOrder: (ItemWithOrder | OrderedItem)[],
  pendingItem: ItemWithOrder,
): number {
  const pendingReleaseDate = pendingItem.releaseDate?.trim() || null;
  if (!pendingReleaseDate) {
    return currentOrder.length;
  }

  const lastMatchingIndex = currentOrder.reduce<number>((lastIndex, item, index) => {
    const itemReleaseDate = item.releaseDate?.trim() || null;
    if (!itemReleaseDate) {
      return lastIndex;
    }
    return itemReleaseDate <= pendingReleaseDate ? index : lastIndex;
  }, -1);

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
}
