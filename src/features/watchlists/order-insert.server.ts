import type { WatchlistItemOrderMode } from "./order";

export type InsertionPosition = "beginning" | "end" | "release-adjacent";

type ItemWithOrder = {
  id?: number;
  tmdbId: string;
  mediaType: string;
  releaseDate: string | null;
  customRank: number | null;
};

type OrderedItem = ItemWithOrder & { newRank: number };

export function computeItemInsertionOrder(
  existingItems: ItemWithOrder[],
  newItem: ItemWithOrder,
  position: InsertionPosition,
  itemOrderMode: WatchlistItemOrderMode,
): OrderedItem[] {
  if (itemOrderMode === "release") {
    return [{ ...newItem, newRank: 1 }];
  }

  const sortedExisting = [...existingItems].sort((a, b) => {
    if (a.customRank !== null && b.customRank !== null) {
      if (a.customRank !== b.customRank) {
        return a.customRank - b.customRank;
      }
    } else if (a.customRank === null && b.customRank !== null) {
      return 1;
    } else if (a.customRank !== null && b.customRank === null) {
      return -1;
    }

    const releaseCompare = compareReleaseDates(a.releaseDate, b.releaseDate);
    if (releaseCompare !== 0) {
      return releaseCompare;
    }

    return (a.id ?? 0) - (b.id ?? 0);
  });

  const result: OrderedItem[] = [];

  if (position === "end") {
    for (const item of sortedExisting) {
      if (item.id !== undefined) {
        result.push({ ...item, newRank: result.length + 1 });
      }
    }
    result.push({ ...newItem, newRank: result.length + 1 });
    return result;
  }

  if (position === "beginning") {
    result.push({ ...newItem, newRank: 1 });
    for (const item of sortedExisting) {
      if (item.id !== undefined) {
        result.push({ ...item, newRank: result.length + 1 });
      }
    }
    return result;
  }

  const nextOrder: (ItemWithOrder | OrderedItem)[] = [...sortedExisting];
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

  let lastMatchingIndex = -1;

  for (const [index, item] of currentOrder.entries()) {
    const itemReleaseDate = normalizeReleaseDate("releaseDate" in item ? item.releaseDate : null);
    if (!itemReleaseDate) {
      continue;
    }

    if (itemReleaseDate <= pendingReleaseDate) {
      lastMatchingIndex = index;
    }
  }

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
}

function normalizeReleaseDate(releaseDate: string | null | undefined): string | null {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function compareReleaseDates(left: string | null, right: string | null): number {
  const leftNorm = normalizeReleaseDate(left);
  const rightNorm = normalizeReleaseDate(right);
  if (leftNorm === null && rightNorm === null) return 0;
  if (leftNorm === null) return 1;
  if (rightNorm === null) return -1;
  return leftNorm.localeCompare(rightNorm);
}
