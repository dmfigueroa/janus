import type { Watchlist } from "@/db/Schema";
import type { WatchlistItem } from "@/db/Schema";

export type WatchlistItemOrderMode = Watchlist["itemOrderMode"];

export type InsertionPosition = "beginning" | "end" | "before" | "after";

type ItemWithOrder = {
  id?: number;
  tmdbId: string;
  mediaType: string;
  releaseDate: string | null;
  customRank: number | null;
};

type OrderedItem = ItemWithOrder & { newRank: number };

export class InvalidInsertionReferenceError extends Error {
  constructor(public referenceItemId: number) {
    super(`Reference item ${referenceItemId} cannot anchor this insertion.`);
  }
}

export function compareReleaseDates(
  left: Pick<WatchlistItem, "id" | "releaseDate">,
  right: Pick<WatchlistItem, "id" | "releaseDate">,
) {
  const releaseComparison = compareNullableReleaseDates(left.releaseDate, right.releaseDate);
  return releaseComparison || left.id - right.id;
}

function compareNullableReleaseDates(left: string | null, right: string | null): number {
  const normalizedLeft = normalizeReleaseDate(left);
  const normalizedRight = normalizeReleaseDate(right);

  if (normalizedLeft === null) return compareMissingLeftValue(normalizedRight);
  if (normalizedRight === null) return -1;
  return normalizedLeft.localeCompare(normalizedRight);
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
  referenceItemId?: number,
): OrderedItem[] {
  if (itemOrderMode === "release") {
    return [{ ...newItem, newRank: 1 }];
  }

  const sortedExisting = sortItemsByCustomOrder(existingItems);
  return positionItem(sortedExisting, newItem, position, referenceItemId);
}

function sortItemsByCustomOrder(items: ItemWithOrder[]): ItemWithOrder[] {
  return [...items].sort((left, right) => {
    const rankComparison = compareSortRanks(left.customRank, right.customRank);
    if (rankComparison !== null) return rankComparison;
    return (
      compareNullableReleaseDates(left.releaseDate, right.releaseDate) ||
      itemIdOrZero(left) - itemIdOrZero(right)
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
  referenceItemId?: number,
): OrderedItem[] {
  if (isAnchorPosition(position)) {
    return spliceAroundReference(sorted, newItem, position, referenceItemId ?? NaN);
  }
  return positionFunctions[position](sorted, newItem);
}

function isAnchorPosition(position: InsertionPosition): position is "before" | "after" {
  return position === "before" || position === "after";
}

function spliceAroundReference(
  sorted: ItemWithOrder[],
  newItem: ItemWithOrder,
  position: "before" | "after",
  referenceItemId: number,
): OrderedItem[] {
  const reference = sorted.find((item) => item.id === referenceItemId);
  if (!reference || reference.customRank === null) {
    throw new InvalidInsertionReferenceError(referenceItemId);
  }
  const nextOrder: (ItemWithOrder | OrderedItem)[] = [...sorted];
  const spliceAt = anchorSpliceIndex(nextOrder, referenceItemId, position);
  nextOrder.splice(spliceAt, 0, { ...newItem, customRank: reference.customRank });
  return renumberOrder(nextOrder);
}

function anchorSpliceIndex(
  currentOrder: (ItemWithOrder | OrderedItem)[],
  referenceItemId: number,
  position: "before" | "after",
): number {
  const referenceIndex = currentOrder.findIndex((item) => item.id === referenceItemId);
  return position === "before" ? referenceIndex : referenceIndex + 1;
}

function renumberOrder<T extends ItemWithOrder>(order: T[]): (T & { newRank: number })[] {
  return order.map((item, index) => ({ ...item, newRank: index + 1 }));
}

const positionFunctions = {
  beginning: positionAtBeginning,
  end: positionAtEnd,
} satisfies Record<Exclude<InsertionPosition, "before" | "after">, typeof positionAtBeginning>;

function positionAtBeginning(sorted: ItemWithOrder[], newItem: ItemWithOrder): OrderedItem[] {
  const rankedNew = [{ ...newItem, newRank: 1 }];
  const rankedExisting = sorted
    .filter((item): item is ItemWithOrder & { id: number } => item.id !== undefined)
    .map((item, index) => ({ ...item, newRank: rankedNew.length + index + 1 }));
  return [...rankedNew, ...rankedExisting];
}

function positionAtEnd(sorted: ItemWithOrder[], newItem: ItemWithOrder): OrderedItem[] {
  const rankedExisting = sorted
    .filter((item): item is ItemWithOrder & { id: number } => item.id !== undefined)
    .map((item, index) => ({ ...item, newRank: index + 1 }));
  return [...rankedExisting, { ...newItem, newRank: rankedExisting.length + 1 }];
}
