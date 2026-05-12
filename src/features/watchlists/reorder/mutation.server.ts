import { getDb } from "@/db/db.server";
import { watchlistItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ReorderItemsInput } from "./schema";
import { buildDetailOrderBy } from "@/features/watchlists/order.server";

export async function reorderItems({ watchlistId, itemIds }: ReorderItemsInput) {
  const db = getDb();

  // Verify all items belong to this watchlist
  const existingItems = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId));

  const validIds = new Set(existingItems.map((i) => i.id));
  if (itemIds.some((id) => !validIds.has(id))) {
    return { success: false, message: "Some items do not belong to this watchlist" };
  }

  const submittedIds = new Set(itemIds);
  if (submittedIds.size !== existingItems.length || itemIds.length !== existingItems.length) {
    return {
      success: false,
      message: "Reordering requires the full unfiltered watchlist.",
    };
  }

  // Use a transaction to update ranks
  db.transaction((tx) => {
    // We update only the items passed in itemIds.
    // If it's a partial list (e.g. one page), we still set their ranks starting from 1?
    // Wait, if it's a partial list, it's tricky.
    // But the PRD says reordering is on the "full unfiltered list".
    // If the UI sends all items it has, we should probably update those.
    // For now, let's assume itemIds contains the desired order for the items it includes.
    for (let i = 0; i < itemIds.length; i++) {
      tx.update(watchlistItems)
        .set({ customRank: i + 1 })
        .where(and(eq(watchlistItems.id, itemIds[i]), eq(watchlistItems.watchlistId, watchlistId)))
        .run();
    }

    // Optional: if there are other items NOT in itemIds, what happens?
    // If this was a "full list" reorder, then all items should be in itemIds.
    // If not, they will keep their old ranks, which might be > itemIds.length.
  });

  return { success: true, message: "Watchlist order updated" };
}

export async function compactWatchlistRanks(watchlistId: number) {
  const db = getDb();

  // Get all items in their current effective order (custom rank first, then release date)
  const items = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...buildDetailOrderBy("custom"));

  if (items.length === 0) return;

  db.transaction((tx) => {
    for (let i = 0; i < items.length; i++) {
      tx.update(watchlistItems)
        .set({ customRank: i + 1 })
        .where(eq(watchlistItems.id, items[i].id))
        .run();
    }
  });
}
