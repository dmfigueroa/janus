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
  const lastAnchoredIndex = new Map<string, number>();

  for (const insertion of pendingInsertions) {
    const result = insertPendingItem(nextOrder, insertion, lastAnchoredIndex);
    if (!result.success) {
      return result;
    }
  }

  return nextOrder;
}

function insertPendingItem(
  nextOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
  lastAnchoredIndex: Map<string, number>,
): { success: true } | AnchoredOrderFailure {
  const anchorKey = getAnchorKey(insertion);
  const spliceIndex = computeSpliceIndex(
    nextOrder,
    insertion,
    anchorKey === null ? undefined : lastAnchoredIndex.get(anchorKey),
  );
  if (typeof spliceIndex !== "number") {
    return spliceIndex;
  }
  nextOrder.splice(spliceIndex, 0, insertion.pendingItem);
  rememberAnchorIndex(lastAnchoredIndex, anchorKey, spliceIndex);
  return { success: true };
}

function rememberAnchorIndex(
  lastAnchoredIndex: Map<string, number>,
  anchorKey: string | null,
  spliceIndex: number,
): void {
  if (anchorKey !== null) {
    lastAnchoredIndex.set(anchorKey, spliceIndex);
  }
}

function computeSpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
  lastInsertedIndex: number | undefined,
): number | AnchoredOrderFailure {
  if (insertion.insertionPosition === "before") {
    return anchoredSpliceIndex(currentOrder, insertion, "before", lastInsertedIndex);
  }
  if (insertion.insertionPosition === "after") {
    return anchoredSpliceIndex(currentOrder, insertion, "after", lastInsertedIndex);
  }
  return legacySpliceIndex(currentOrder, insertion);
}

function getAnchorKey(insertion: PendingInsertion): string | null {
  const position = insertion.insertionPosition;
  if (!isAnchorPosition(position) || insertion.referenceItemId === undefined) {
    return null;
  }
  return `${position}:${insertion.referenceItemId}`;
}

function isAnchorPosition(position: InsertionPosition): position is "before" | "after" {
  return position === "before" || position === "after";
}

function anchoredSpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
  direction: "before" | "after",
  lastInsertedIndex: number | undefined,
): number | AnchoredOrderFailure {
  const { referenceItemId } = insertion;
  if (referenceItemId === undefined) {
    return missingReferenceFailure();
  }
  if (lastInsertedIndex !== undefined) {
    return lastInsertedIndex + 1;
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
  return insertion.insertionPosition === "beginning" ? 0 : currentOrder.length;
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
