import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { watchedItemsExpression } from "@/features/watchlists/Order.server";
import type { WatchlistParentRemovalInput } from "./Schema";

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
