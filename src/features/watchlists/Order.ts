import type { Watchlist } from "@/db/Schema";
import type { WatchlistItem } from "@/db/Schema";

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
  const releaseComparison = compareNullableReleaseDates(left.releaseDate, right.releaseDate);
  return releaseComparison || left.id - right.id;
}

function compareNullableReleaseDates(left: string | null, right: string | null): number {
  const leftNorm = normalizeReleaseDate(left);
  const rightNorm = normalizeReleaseDate(right);

  if (leftNorm === null) return compareMissingLeftValue(rightNorm);
  if (rightNorm === null) return -1;
  return leftNorm.localeCompare(rightNorm);
}

function normalizeReleaseDate(releaseDate: string | null | undefined) {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function compareMissingLeftValue(right: unknown) {
  return right === null ? 0 : 1;
}

function compareNullableRanks(left: number | null, right: number | null) {
  if (left === null) return compareMissingLeftValue(right);
  if (right === null) return -1;
  return left - right;
}

export function compareItemsByOrderMode(
  left: WatchlistItem,
  right: WatchlistItem,
  itemOrderMode: WatchlistItemOrderMode,
) {
  if (itemOrderMode === "custom") {
    const rankComparison = compareNullableRanks(left.customRank, right.customRank);
    return rankComparison || compareReleaseDates(left, right);
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
    const rankComparison = compareSortRanks(a.customRank, b.customRank);
    if (rankComparison !== null) return rankComparison;
    return (
      compareNullableReleaseDates(a.releaseDate, b.releaseDate) || itemIdOrZero(a) - itemIdOrZero(b)
    );
  });
}

function compareSortRanks(left: number | null, right: number | null) {
  const leftRank = rankOrInfinity(left);
  const rightRank = rankOrInfinity(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return null;
}

function rankOrInfinity(rank: number | null) {
  return rank ?? Infinity;
}

function itemIdOrZero(item: ItemWithOrder) {
  return item.id ?? 0;
}

function positionItem(
  sorted: ItemWithOrder[],
  newItem: ItemWithOrder,
  position: InsertionPosition,
): OrderedItem[] {
  return positionFunctions[position]?.(sorted, newItem) as OrderedItem[];
}

const positionFunctions = {
  beginning: positionAtBeginning,
  end: positionAtEnd,
  "release-adjacent": positionReleaseAdjacent,
} satisfies Record<InsertionPosition, typeof positionAtBeginning>;

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
  const pendingReleaseDate = normalizeReleaseDate(pendingItem.releaseDate);
  if (!pendingReleaseDate) {
    return currentOrder.length;
  }

  const lastMatchingIndex = currentOrder.reduce<number>((lastIndex, item, index) => {
    const itemReleaseDate = normalizeReleaseDate(item.releaseDate);
    if (!itemReleaseDate) {
      return lastIndex;
    }
    return itemReleaseDate <= pendingReleaseDate ? index : lastIndex;
  }, -1);

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
}
