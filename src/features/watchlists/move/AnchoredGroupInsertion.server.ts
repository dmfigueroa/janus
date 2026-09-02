import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import type { InsertionPosition } from "@/features/watchlists/Order";
import { and, asc, eq } from "drizzle-orm";
import { customRankOrder } from "@/features/watchlists/Order.server";
import { planGroupInsertionSlots, type ExistingItemSlot } from "./GroupInsertion.server";

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
  const slots = planGroupInsertionSlots({
    orderedExisting,
    itemsToInsert: items.length,
    position,
    referenceItemId,
  });

  applyRankUpdates(transaction, orderedExisting, slots, destination.id);
  applyInsertItems(transaction, items, slots, destination.id, buildItemInsertFields);
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
    .map((item) => ({ id: item.id, customRank: item.customRank! }));
}

function applyRankUpdates(
  transaction: DatabaseTransaction,
  orderedExisting: ExistingItemSlot[],
  slots: Array<{ id: number }>,
  destinationId: number,
) {
  slots.forEach((slot, idx) => {
    updateRankIfNeeded(transaction, orderedExisting, slot, idx, destinationId);
  });
}

function updateRankIfNeeded(
  transaction: DatabaseTransaction,
  orderedExisting: ExistingItemSlot[],
  slot: { id: number },
  idx: number,
  destinationId: number,
) {
  if (slot.id === 0) {
    return;
  }
  const expectedRank = idx + 1;
  const current = orderedExisting.find((row) => row.id === slot.id);
  if (!isRankStale(current, expectedRank)) {
    return;
  }
  writeRank(transaction, slot.id, expectedRank, destinationId);
}

function isRankStale(current: ExistingItemSlot | undefined, expectedRank: number): boolean {
  if (!current) {
    return false;
  }
  return current.customRank !== expectedRank;
}

function writeRank(
  transaction: DatabaseTransaction,
  itemId: number,
  expectedRank: number,
  destinationId: number,
) {
  transaction
    .update(watchlistItems)
    .set({ customRank: expectedRank })
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, destinationId)))
    .run();
}

function applyInsertItems(
  transaction: DatabaseTransaction,
  items: WatchlistItemRow[],
  slots: Array<{ id: number }>,
  destinationId: number,
  buildItemInsertFields: (item: WatchlistItemRow) => GroupItemInsertFields,
) {
  let slotCursor = 0;
  for (const item of items) {
    slotCursor = advanceToInsertSlot(slots, slotCursor);
    transaction
      .insert(watchlistItems)
      .values({
        ...buildItemInsertFields(item),
        watchlistId: destinationId,
        customRank: slotCursor + 1,
      })
      .run();
    slotCursor += 1;
  }
}

function advanceToInsertSlot(slots: Array<{ id: number }>, startFrom: number): number {
  let cursor = startFrom;
  while (slots[cursor]?.id !== 0) {
    cursor += 1;
  }
  return cursor;
}
