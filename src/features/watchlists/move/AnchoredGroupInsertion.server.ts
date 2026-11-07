import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { and, asc, eq } from "drizzle-orm";
import { customRankOrder } from "@/features/watchlists/Order.server";
import { InsertItemReferenceError } from "@/features/watchlists/InsertOrderedItem.server";

const anchoredPositions = new Set<InsertionPosition | undefined>(["before", "after"]);

type ExistingItemSlot = { id: number; customRank: number };

type WatchlistItemRow = typeof watchlistItems.$inferSelect;

export type GroupInsertionDestination = {
  id: number;
};

export type GroupItemInsertFields = Omit<
  typeof watchlistItems.$inferSelect,
  "id" | "watchlistId" | "customRank"
> & {
  addedAt: string;
};

export function applyAnchoredGroupInsertion(
  transaction: DatabaseTransaction,
  items: WatchlistItemRow[],
  destination: GroupInsertionDestination,
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
  buildItemInsertFields: (item: WatchlistItemRow) => GroupItemInsertFields,
): void {
  const orderedExisting = fetchRankedExisting(transaction, destination.id);
  // Empty groups historically normalize existing ranks without validating an anchor.
  const insertionIndex =
    items.length === 0 ? 0 : resolveInsertionIndex(orderedExisting, position, referenceItemId);

  orderedExisting.forEach((item, index) => {
    const rank = index + 1 + (index >= insertionIndex ? items.length : 0);
    if (item.customRank !== rank) {
      transaction
        .update(watchlistItems)
        .set({ customRank: rank })
        .where(and(eq(watchlistItems.id, item.id), eq(watchlistItems.watchlistId, destination.id)))
        .run();
    }
  });
  items.forEach((item, index) => {
    transaction
      .insert(watchlistItems)
      .values({
        ...buildItemInsertFields(item),
        watchlistId: destination.id,
        customRank: insertionIndex + index + 1,
      })
      .run();
  });
}

function resolveInsertionIndex(
  existingItems: ExistingItemSlot[],
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
): number {
  if (position === "beginning") return 0;
  if (anchoredPositions.has(position)) {
    return findAnchorIndex(existingItems, referenceItemId) + Number(position === "after");
  }
  return existingItems.length;
}

function findAnchorIndex(
  existingItems: ExistingItemSlot[],
  referenceItemId: number | undefined,
): number {
  const index = existingItems.findIndex((item) => item.id === referenceItemId);
  if (index === -1) throw new InsertItemReferenceError(referenceItemId ?? NaN);
  return index;
}

function fetchRankedExisting(
  transaction: DatabaseTransaction,
  destinationId: number,
): ExistingItemSlot[] {
  const existingItems = transaction
    .select({
      id: watchlistItems.id,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, destinationId))
    .orderBy(...customRankOrder, asc(watchlistItems.id))
    .all();

  return existingItems
    .filter((item) => item.customRank !== null)
    .map((item) => ({
      id: item.id,
      customRank: item.customRank!,
    }));
}
