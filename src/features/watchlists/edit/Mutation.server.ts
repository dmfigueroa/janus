import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { and, eq } from "drizzle-orm";
import type { EditWatchlistItemInput } from "./Mutation";

export type EditWatchlistItemResult = { success: true } | { success: false; message: string };

export async function editWatchlistItemMutation(
  input: EditWatchlistItemInput,
): Promise<EditWatchlistItemResult> {
  const db = getDb();
  const result = await db
    .update(watchlistItems)
    .set({
      title: input.title.trim(),
      releaseDate: input.releaseDate,
      posterPath: input.posterPath,
    })
    .where(
      and(eq(watchlistItems.id, input.itemId), eq(watchlistItems.watchlistId, input.watchlistId)),
    )
    .returning({ id: watchlistItems.id });

  return result.length > 0
    ? { success: true }
    : { success: false, message: "Watchlist item not found." };
}
