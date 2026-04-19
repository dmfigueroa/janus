import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/db.server";
import { watchlistItems, watchlists } from "../db/schema";

export { addToWatchlist } from "@/features/watchlists/mutations";
export type { Watchlist, WatchlistItem } from "../db/schema";

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const db = getDb();
    const [item] = await db
      .select({ watchlistId: watchlistItems.watchlistId })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, data.itemId));

    await db
      .update(watchlistItems)
      .set({ isWatched: data.isWatched })
      .where(eq(watchlistItems.id, data.itemId));

    if (item && data.isWatched) {
      await db
        .update(watchlists)
        .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, item.watchlistId));
    }

    return { success: true };
  });
