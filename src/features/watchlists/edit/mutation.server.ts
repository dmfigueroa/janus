import { getDb } from "@/db/db.server";
import { watchlistItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { EditWatchlistItemInput } from "./mutation";

export type EditWatchlistItemResult = { success: true } | { success: false; message: string };

export async function editWatchlistItemMutation(
  input: EditWatchlistItemInput,
): Promise<EditWatchlistItemResult> {
  const db = getDb();
  const result = await db
    .update(watchlistItems)
    .set({ title: input.title.trim(), releaseDate: input.releaseDate })
    .where(
      and(eq(watchlistItems.id, input.itemId), eq(watchlistItems.watchlistId, input.watchlistId)),
    )
    .returning({ id: watchlistItems.id });

  return result.length > 0
    ? { success: true }
    : { success: false, message: "Watchlist item not found." };
}
