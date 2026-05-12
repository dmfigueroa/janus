import { getDb } from "@/db/db.server";
import { watchlistItems } from "@/db/schema";
import { buildDetailOrderBy } from "@/features/watchlists/order.server";
import { and, eq } from "drizzle-orm";
import type { ReorderItemsInput } from "./schema";

export async function reorderItems({ watchlistId, itemIds }: ReorderItemsInput) {
  const db = getDb();

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

  db.transaction((tx) => {
    for (let i = 0; i < itemIds.length; i++) {
      tx.update(watchlistItems)
        .set({ customRank: i + 1 })
        .where(and(eq(watchlistItems.id, itemIds[i]), eq(watchlistItems.watchlistId, watchlistId)))
        .run();
    }
  });

  return { success: true, message: "Watchlist order updated" };
}

export async function compactWatchlistRanks(watchlistId: number) {
  const db = getDb();

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
