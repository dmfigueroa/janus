import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import type { ToggleWatchedInput } from "./Mutation";
import { markLastWatched } from "@/features/watchlists/Repository.server";
import { eq } from "drizzle-orm";

export async function toggleWatchedMutation({
  itemId,
  isWatched,
  updateWatchlistRecency = true,
}: ToggleWatchedInput) {
  const db = getDb();
  const [item] = await db
    .select({ watchlistId: watchlistItems.watchlistId })
    .from(watchlistItems)
    .where(eq(watchlistItems.id, itemId));

  if (!item) {
    return { success: false as const, message: "Item not found." };
  }

  return applyWatchedToggle(db, item.watchlistId, itemId, isWatched, updateWatchlistRecency);
}

async function applyWatchedToggle(
  db: ReturnType<typeof getDb>,
  watchlistId: number,
  itemId: number,
  isWatched: boolean,
  updateWatchlistRecency: boolean,
) {
  await db.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId));

  const recencyUpdate = updateRecencyAfterToggle(watchlistId, isWatched, updateWatchlistRecency);
  if (recencyUpdate) {
    await recencyUpdate;
  }

  return { success: true as const };
}

function updateRecencyAfterToggle(
  watchlistId: number,
  isWatched: boolean,
  updateWatchlistRecency: boolean,
) {
  if (isWatched && updateWatchlistRecency) {
    return markLastWatched(watchlistId);
  }
}
