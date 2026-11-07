import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import type { SetWatchedStateInput } from "./SetWatchedState";
import { eq, sql } from "drizzle-orm";

export async function setWatchedStateMutation({
  itemId,
  isWatched,
  updateWatchlistRecency = true,
}: SetWatchedStateInput) {
  return getDb().transaction((transaction) => {
    const item = transaction
      .select({ watchlistId: watchlistItems.watchlistId, isWatched: watchlistItems.isWatched })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, itemId))
      .get();

    if (!item) return { success: false as const, message: "Item not found." };
    if (item.isWatched === isWatched) return { success: true as const };

    persistWatchedState(transaction, item.watchlistId, {
      itemId,
      isWatched,
      updateWatchlistRecency,
    });
    return { success: true as const };
  });
}

function persistWatchedState(
  transaction: DatabaseTransaction,
  watchlistId: number,
  { itemId, isWatched, updateWatchlistRecency }: SetWatchedStateInput,
) {
  transaction.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId)).run();
  if (isWatched && updateWatchlistRecency) {
    transaction
      .update(watchlists)
      .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, watchlistId))
      .run();
  }
}
