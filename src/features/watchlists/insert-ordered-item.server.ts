import { watchlistItems } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { computeItemInsertionOrder, type InsertionPosition } from "@/features/watchlists/order";
import { customRankOrder } from "@/features/watchlists/order.server";
import type { WatchlistTransaction } from "@/features/watchlists/repository.server";

export type { InsertionPosition };

export type ItemInsertFields = Omit<
  typeof watchlistItems.$inferSelect,
  "id" | "watchlistId" | "customRank"
>;

type PersistedOrderedItem = ReturnType<typeof computeItemInsertionOrder>[number] & { id: number };

export function insertItemWithCustomOrder(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
  position: InsertionPosition,
): void {
  const existingItems = fetchExistingItems(transaction, destinationId);

  const orderedItems = computeItemInsertionOrder(
    existingItems,
    {
      tmdbId: insertFields.tmdbId,
      mediaType: insertFields.mediaType,
      releaseDate: insertFields.releaseDate,
      customRank: null,
    },
    position,
    "custom",
  );

  applyRankUpdates(transaction, orderedItems, destinationId);
  insertNewItem(transaction, orderedItems, insertFields, destinationId);
}

function fetchExistingItems(transaction: WatchlistTransaction, destinationId: number) {
  return transaction
    .select({
      id: watchlistItems.id,
      tmdbId: watchlistItems.tmdbId,
      mediaType: watchlistItems.mediaType,
      releaseDate: watchlistItems.releaseDate,
      customRank: watchlistItems.customRank,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, destinationId))
    .orderBy(...customRankOrder, asc(watchlistItems.id))
    .all();
}

function applyRankUpdates(
  transaction: WatchlistTransaction,
  orderedItems: ReturnType<typeof computeItemInsertionOrder>,
  destinationId: number,
) {
  orderedItems
    .filter(
      (item): item is PersistedOrderedItem =>
        item.id !== undefined && item.newRank !== item.customRank,
    )
    .forEach((item) => {
      transaction
        .update(watchlistItems)
        .set({ customRank: item.newRank })
        .where(and(eq(watchlistItems.id, item.id), eq(watchlistItems.watchlistId, destinationId)))
        .run();
    });
}

function insertNewItem(
  transaction: WatchlistTransaction,
  orderedItems: ReturnType<typeof computeItemInsertionOrder>,
  insertFields: ItemInsertFields,
  destinationId: number,
) {
  const insertedItem = orderedItems.find((o) => o.id === undefined);
  if (!insertedItem) return;

  transaction
    .insert(watchlistItems)
    .values({
      watchlistId: destinationId,
      ...insertFields,
      customRank: insertedItem.newRank,
    })
    .run();
}
