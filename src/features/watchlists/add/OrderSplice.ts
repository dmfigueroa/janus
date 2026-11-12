import type { InsertionPosition } from "@/features/watchlists/Order";

type HasReleaseDate = { releaseDate?: string | null };
type ExistingOrderItem = HasReleaseDate & { id: number; customRank: number | null };
type PendingOrderItem = HasReleaseDate & { pendingIndex: number };

export type OrderedWatchlistItem = ExistingOrderItem | PendingOrderItem;

export type AnchoredOrderFailure = {
  success: false;
  code: "invalid_reference";
  referenceItemId: number;
};

export type PendingInsertion = {
  pendingItem: PendingOrderItem;
  insertionPosition: InsertionPosition;
  referenceItemId?: number;
};

export function buildFinalOrder({
  existingItems,
  pendingInsertions,
}: {
  existingItems: readonly ExistingOrderItem[];
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
  const { insertionPosition, referenceItemId } = insertion;
  if (isAnchorPosition(insertionPosition) && referenceItemId !== undefined) {
    return `${insertionPosition}:${referenceItemId}`;
  }
  return null;
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
    return { success: false, code: "invalid_reference", referenceItemId: NaN };
  }
  if (lastInsertedIndex !== undefined) {
    return lastInsertedIndex + 1;
  }
  return referenceSpliceIndex(currentOrder, referenceItemId, direction);
}

function referenceSpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  referenceItemId: number,
  direction: "before" | "after",
): number | AnchoredOrderFailure {
  const referenceIndex = currentOrder.findIndex(
    (item): item is ExistingOrderItem =>
      "id" in item && item.id === referenceItemId && item.customRank !== null,
  );
  if (referenceIndex === -1) {
    return { success: false, code: "invalid_reference", referenceItemId };
  }
  return referenceIndex + Number(direction === "after");
}

function legacySpliceIndex(
  currentOrder: OrderedWatchlistItem[],
  insertion: PendingInsertion,
): number {
  return insertion.insertionPosition === "beginning" ? 0 : currentOrder.length;
}
