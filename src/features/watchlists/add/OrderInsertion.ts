import { compareReleaseDates, type InsertionPosition } from "@/features/watchlists/Order";

type HasReleaseDate = { releaseDate?: string | null };
type ExistingItem = HasReleaseDate & { id: number; customRank: number | null };
type PendingItem = HasReleaseDate & { pendingIndex: number };

export type OrderedWatchlistItem = ExistingItem | PendingItem;

export type AnchoredOrderFailure = {
  success: false;
  code: "invalid_reference";
  referenceItemId: number;
};

export type PendingInsertion = {
  pendingItem: PendingItem;
  insertionPosition: InsertionPosition;
  referenceItemId?: number;
};

export function buildFinalOrder({
  existingItems,
  pendingInsertions,
}: {
  existingItems: readonly ExistingItem[];
  pendingInsertions: readonly PendingInsertion[];
}): OrderedWatchlistItem[] | AnchoredOrderFailure {
  const nextOrder: OrderedWatchlistItem[] = [...existingItems];

  for (const insertion of pendingInsertions) {
    const spliceIndex = computeSpliceIndex(nextOrder, insertion);
    if (typeof spliceIndex !== "number") {
      return spliceIndex;
    }
    nextOrder.splice(spliceIndex, 0, insertion.pendingItem);
  }

  return nextOrder;
}

function computeSpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
): number | AnchoredOrderFailure {
  if (insertion.insertionPosition === "before") {
    return anchoredSpliceIndex(currentOrder, insertion, "before");
  }
  if (insertion.insertionPosition === "after") {
    return anchoredSpliceIndex(currentOrder, insertion, "after");
  }
  return legacySpliceIndex(currentOrder, insertion);
}

function anchoredSpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
  direction: "before" | "after",
): number | AnchoredOrderFailure {
  const { referenceItemId } = insertion;
  if (referenceItemId === undefined) {
    return missingReferenceFailure();
  }
  const referenceIndex = findRankedReference(currentOrder, referenceItemId);
  return spliceIndexForReference(referenceIndex, direction, referenceItemId);
}

function spliceIndexForReference(
  referenceIndex: number,
  direction: "before" | "after",
  referenceItemId: number,
): number | AnchoredOrderFailure {
  if (referenceIndex === -1) {
    return { success: false, code: "invalid_reference", referenceItemId };
  }
  return direction === "before" ? referenceIndex : referenceIndex + 1;
}

function findRankedReference(
  currentOrder: OrderedWatchlistItem[],
  referenceItemId: number,
): number {
  return currentOrder.findIndex(
    (item): item is ExistingItem =>
      "id" in item && item.id === referenceItemId && item.customRank !== null,
  );
}

function missingReferenceFailure(): AnchoredOrderFailure {
  return { success: false, code: "invalid_reference", referenceItemId: NaN };
}

function legacySpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
): number {
  if (insertion.insertionPosition === "beginning") {
    return 0;
  }
  if (insertion.insertionPosition === "end") {
    return currentOrder.length;
  }
  return getReleaseAdjacentInsertionIndex(currentOrder, insertion.pendingItem);
}

function normalizeReleaseDate(releaseDate: string | null | undefined) {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function getReleaseAdjacentInsertionIndex(
  currentOrder: OrderedWatchlistItem[],
  pendingItem: HasReleaseDate,
) {
  const pendingReleaseDate = normalizeReleaseDate(pendingItem.releaseDate);
  if (!pendingReleaseDate) {
    return currentOrder.length;
  }

  const lastMatchingIndex = currentOrder.reduce<number>(
    (lastIndex, item, index) =>
      updateReleaseAdjacentIndex(lastIndex, index, item, pendingReleaseDate),
    -1,
  );

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
}

function updateReleaseAdjacentIndex(
  lastIndex: number,
  index: number,
  item: OrderedWatchlistItem,
  pendingReleaseDate: string,
) {
  const itemReleaseDate = normalizeReleaseDate(item.releaseDate);
  if (!itemReleaseDate) {
    return lastIndex;
  }
  return itemReleaseDate <= pendingReleaseDate ? index : lastIndex;
}

export function orderPendingItemsByReleaseDate<T extends HasReleaseDate>(
  items: T[],
): Array<T & { pendingIndex: number }> {
  return items
    .map((item, pendingIndex) => ({
      ...item,
      pendingIndex,
    }))
    .sort((left, right) =>
      compareReleaseDates(
        {
          id: left.pendingIndex,
          releaseDate: left.releaseDate ?? null,
        },
        {
          id: right.pendingIndex,
          releaseDate: right.releaseDate ?? null,
        },
      ),
    );
}
