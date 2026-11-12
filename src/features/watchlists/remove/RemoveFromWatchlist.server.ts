import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { watchedItemsExpression } from "@/features/watchlists/Order.server";
import type { RemoveWatchlistItemInput, WatchlistParentRemovalInput } from "./RemoveFromWatchlist";

export async function removeWatchlistItemMutation({
  watchlistId,
  itemId,
}: RemoveWatchlistItemInput) {
  const db = getDb();
  const deleted = await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.id, itemId)))
    .returning({ id: watchlistItems.id });

  return {
    success: true as const,
    removedCount: deleted.length,
    message: "Removed item from watchlist.",
  };
}

export async function removeWatchlistParentMutation({
  watchlistId,
  parentId,
}: WatchlistParentRemovalInput) {
  const db = getDb();
  const deleted = await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.parentId, parentId)))
    .returning({ id: watchlistItems.id });

  return {
    success: true as const,
    removedCount: deleted.length,
    message: `Removed ${deleted.length} items from watchlist.`,
  };
}

export async function getWatchlistParentRemovalPreview({
  watchlistId,
  parentId,
}: WatchlistParentRemovalInput) {
  const db = getDb();
  const [result] = await db
    .select({
      count: count(),
      watchedCount: watchedItemsExpression,
    })
    .from(watchlistItems)
    .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.parentId, parentId)));

  return {
    count: numberOrZero(result?.count),
    watchedCount: numberOrZero(result?.watchedCount),
  };
}

function numberOrZero(value: number | null | undefined) {
  return value ?? 0;
}
