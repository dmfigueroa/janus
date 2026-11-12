import type { InsertWatchlistItem, WatchlistItem } from "@/db/Schema";
import { toWatchlistItemKey } from "@/features/watchlists/ItemKey";
import { compareReleaseDates, type InsertionPosition } from "@/features/watchlists/Order";
import {
  buildFinalOrder,
  type AnchoredOrderFailure,
  type OrderedWatchlistItem,
} from "./OrderSplice";

export type PendingWatchlistItem = InsertWatchlistItem;

export type PersistedWatchlistItem = Pick<
  WatchlistItem,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

type HasReleaseDate = { releaseDate?: string | null };
type PendingWatchlistItemWithIndex = PendingWatchlistItem & { pendingIndex: number };

export type CustomOrderWrites = {
  inserts: Array<{ item: PendingWatchlistItemWithIndex; rank: number }>;
  updates: Array<{ id: number; rank: number }>;
};

export type CustomOrderInsertion =
  | CustomOrderWrites
  | null
  | { failure: { success: false; code: "invalid_reference"; message: string } };

export function computeCustomOrderInsertion({
  existingItems,
  pendingItems,
  insertionPosition,
  referenceItemId,
}: {
  existingItems: PersistedWatchlistItem[];
  pendingItems: PendingWatchlistItem[];
  insertionPosition: InsertionPosition;
  referenceItemId?: number;
}): CustomOrderInsertion {
  const dedupedItems = dedupePendingItems(pendingItems, existingItems);
  if (dedupedItems.length === 0) {
    return null;
  }

  const orderedPendingItems = orderPendingItemsByReleaseDate(dedupedItems);
  const finalOrder = buildFinalOrder({
    existingItems,
    pendingInsertions: orderedPendingItems.map((pendingItem) => ({
      pendingItem,
      insertionPosition,
      referenceItemId,
    })),
  });

  if (!Array.isArray(finalOrder)) {
    return {
      failure: {
        success: false,
        code: finalOrder.code,
        message: anchorFailureMessage(finalOrder.code, finalOrder.referenceItemId),
      },
    };
  }

  return assignCustomRanks(finalOrder);
}

export function orderPendingItemsByReleaseDate<T extends HasReleaseDate>(
  items: T[],
): Array<T & { pendingIndex: number }> {
  return items
    .map((item, pendingIndex) => ({ ...item, pendingIndex }))
    .sort((left, right) =>
      compareReleaseDates(
        { id: left.pendingIndex, releaseDate: left.releaseDate ?? null },
        { id: right.pendingIndex, releaseDate: right.releaseDate ?? null },
      ),
    );
}

function assignCustomRanks(ordered: OrderedWatchlistItem[]): CustomOrderWrites {
  const inserts: CustomOrderWrites["inserts"] = [];
  const updates: CustomOrderWrites["updates"] = [];

  for (const [index, item] of ordered.entries()) {
    const rank = index + 1;

    if ("pendingIndex" in item) {
      inserts.push({ item: item as PendingWatchlistItemWithIndex, rank });
    } else {
      updates.push({ id: item.id, rank });
    }
  }

  return { inserts, updates };
}

function dedupePendingItems(
  items: PendingWatchlistItem[],
  existingItems: PersistedWatchlistItem[],
): typeof items {
  const existingKeys = new Set(existingItems.map(toWatchlistItemKey));
  const pendingKeys = new Set<string>();

  return items.filter((item) => {
    const itemKey = toWatchlistItemKey(item);
    if (existingKeys.has(itemKey) || pendingKeys.has(itemKey)) {
      return false;
    }

    pendingKeys.add(itemKey);
    return true;
  });
}

function anchorFailureMessage(code: AnchoredOrderFailure["code"], referenceItemId: number): string {
  if (code === "invalid_reference") {
    return Number.isNaN(referenceItemId)
      ? "Reference item is required for anchored insertion."
      : `Reference item ${referenceItemId} is not in this watchlist.`;
  }
  return "Anchored insertion is not available.";
}
