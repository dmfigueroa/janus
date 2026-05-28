import { compareReleaseDates } from "@/features/watchlists/order";
import type { AddToWatchlistInsertionPosition } from "./mutation";

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

  let lastMatchingIndex = -1;

  for (const [index, item] of currentOrder.entries()) {
    const itemReleaseDate = normalizeReleaseDate(item.releaseDate);
    if (!itemReleaseDate) {
      continue;
    }

    if (itemReleaseDate <= pendingReleaseDate) {
      lastMatchingIndex = index;
    }
  }

  return lastMatchingIndex === -1 ? 0 : lastMatchingIndex + 1;
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
