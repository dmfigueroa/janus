import { getDb } from "@/db/db.server";
import { watchlistItems } from "@/db/schema";
import type { ToggleWatchedInput } from "./mutation";
import { markLastWatched } from "@/features/watchlists/repository.server";
import { eq } from "drizzle-orm";

export async function toggleWatchedMutation({ itemId, isWatched }: ToggleWatchedInput) {
  const db = getDb();
  const [item] = await db
    .select({ watchlistId: watchlistItems.watchlistId })
    .from(watchlistItems)
    .where(eq(watchlistItems.id, itemId));

  if (!item) {
    return { success: false, message: "Item not found." };
  }

  await db.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId));

  if (isWatched) {
    await markLastWatched(item.watchlistId);
  }

  return { success: true };
}
