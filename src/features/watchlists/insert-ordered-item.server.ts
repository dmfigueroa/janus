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

export function insertItemWithCustomOrder(
  transaction: WatchlistTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
  position: InsertionPosition,
): void {
  const existingItems = transaction
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

  for (const orderedItem of orderedItems) {
    if (orderedItem.id !== undefined && orderedItem.newRank !== orderedItem.customRank) {
      transaction
        .update(watchlistItems)
        .set({ customRank: orderedItem.newRank })
        .where(
          and(eq(watchlistItems.id, orderedItem.id), eq(watchlistItems.watchlistId, destinationId)),
        )
        .run();
    }
  }

  const insertedItem = orderedItems.find((o) => o.id === undefined);
  if (insertedItem) {
    transaction
      .insert(watchlistItems)
      .values({
        watchlistId: destinationId,
        ...insertFields,
        customRank: insertedItem.newRank,
      })
      .run();
  }
}
