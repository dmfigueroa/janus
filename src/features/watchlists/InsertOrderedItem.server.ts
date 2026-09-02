import { watchlistItems } from "@/db/Schema";
import type { DatabaseTransaction } from "@/db/Db.server";
import { and, asc, eq } from "drizzle-orm";
import {
  computeItemInsertionOrder,
  InvalidInsertionReferenceError,
  type InsertionPosition,
} from "@/features/watchlists/Order";
import { customRankOrder } from "@/features/watchlists/Order.server";

export type { InsertionPosition };

export class InsertItemReferenceError extends Error {
  constructor(public referenceItemId: number) {
    super(`Reference item ${referenceItemId} cannot anchor this insertion.`);
  }
}

export type ItemInsertFields = Omit<
  typeof watchlistItems.$inferSelect,
  "id" | "watchlistId" | "customRank"
>;

type PersistedOrderedItem = ReturnType<typeof computeItemInsertionOrder>[number] & { id: number };

export function insertItemWithCustomOrder(
  transaction: DatabaseTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
  position: InsertionPosition,
  referenceItemId?: number,
): void {
  const existingItems = fetchExistingItems(transaction, destinationId);

  let orderedItems;
  try {
    orderedItems = computeItemInsertionOrder(
      existingItems,
      {
        tmdbId: insertFields.tmdbId,
        mediaType: insertFields.mediaType,
        releaseDate: insertFields.releaseDate,
        customRank: null,
      },
      position,
      "custom",
      referenceItemId,
    );
  } catch (error) {
    if (error instanceof InvalidInsertionReferenceError) {
      throw new InsertItemReferenceError(error.referenceItemId);
    }
    throw error;
  }

  applyRankUpdates(transaction, orderedItems, destinationId);
  insertNewItem(transaction, orderedItems, insertFields, destinationId);
}

function fetchExistingItems(transaction: DatabaseTransaction, destinationId: number) {
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
  transaction: DatabaseTransaction,
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
  transaction: DatabaseTransaction,
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
