import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db/db.server";
import { watchlistItems } from "@/db/schema";
import { watchedItemsExpression } from "@/features/watchlists/order.server";
import type { WatchlistParentRemovalInput } from "./schema";

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
    count: result?.count ?? 0,
    watchedCount: result?.watchedCount ?? 0,
  };
}
