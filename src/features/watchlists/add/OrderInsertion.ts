import { compareReleaseDates } from "@/features/watchlists/Order";
import type { AddToWatchlistInsertionPosition } from "./Mutation";

type HasReleaseDate = { releaseDate?: string | null };
type ExistingItem = HasReleaseDate & { id: number };
type PendingItem = HasReleaseDate & { pendingIndex: number };

export type OrderedWatchlistItem = ExistingItem | PendingItem;

export function buildFinalOrder({
  existingItems,
  pendingItems,
  insertionPosition,
}: {
  existingItems: readonly ExistingItem[];
  pendingItems: readonly PendingItem[];
  insertionPosition: AddToWatchlistInsertionPosition;
}) {
  if (insertionPosition === "beginning") {
    return [...pendingItems, ...existingItems];
  }

  if (insertionPosition === "end") {
    return [...existingItems, ...pendingItems];
  }

  return insertPendingItemsByRelease(existingItems, pendingItems);
}

function insertPendingItemsByRelease(
  existingItems: readonly ExistingItem[],
  pendingItems: readonly PendingItem[],
) {
  const nextOrder: OrderedWatchlistItem[] = [...existingItems];

  for (const pendingItem of pendingItems) {
    const insertionIndex = getReleaseAdjacentInsertionIndex(nextOrder, pendingItem);
    nextOrder.splice(insertionIndex, 0, pendingItem);
  }

  return nextOrder;
}

function normalizeReleaseDate(releaseDate: string | null | undefined) {
  const normalized = releaseDate?.trim();
  return normalized ? normalized : null;
}

function getReleaseAdjacentInsertionIndex(
  currentOrder: OrderedWatchlistItem[],
  pendingItem: PendingItem,
) {
  const pendingReleaseDate = normalizeReleaseDate(pendingItem.releaseDate);
  if (!pendingReleaseDate) {
    return currentOrder.length;
  }

  const lastMatchingIndex = currentOrder.reduce(
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
