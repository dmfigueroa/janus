import { compareReleaseDates } from "@/features/watchlists/order";
import type {
  PersistedWatchlistItem,
  PendingWatchlistItem,
  PendingWatchlistItemWithIndex,
  OrderedWatchlistItem,
} from "./types";
import type { AddToWatchlistInsertionPosition } from "./mutation";

export function buildFinalOrder({
  existingItems,
  pendingItems,
  insertionPosition,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItemWithIndex[];
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
  pendingItem: PendingWatchlistItemWithIndex,
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

export function orderPendingItemsByReleaseDate(
  items: PendingWatchlistItem[],
): PendingWatchlistItemWithIndex[] {
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
