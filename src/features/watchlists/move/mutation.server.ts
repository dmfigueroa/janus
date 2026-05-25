import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

type MoveItemResult =
  | { success: true; movedCount: number; message: string }
  | { success: false; message: string };

export async function moveItemToWatchlistMutation({
  itemId,
  destinationWatchlistId,
}: {
  itemId: number;
  destinationWatchlistId: number;
}): Promise<MoveItemResult> {
  const db = getDb();

  const item = await db.query.watchlistItems.findFirst({
    where: eq(watchlistItems.id, itemId),
  });

  if (!item) {
    return { success: false, message: "Item not found." };
  }

  const destination = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, destinationWatchlistId),
  });

  if (!destination) {
    return { success: false, message: "Destination watchlist not found." };
  }

  const duplicate = await db.query.watchlistItems.findFirst({
    where: and(
      eq(watchlistItems.watchlistId, destinationWatchlistId),
      eq(watchlistItems.tmdbId, item.tmdbId),
      eq(watchlistItems.mediaType, item.mediaType),
    ),
  });

  if (duplicate) {
    return { success: false, message: `"${item.title}" is already in ${destination.name}.` };
  }

  db.transaction((tx) => {
    tx.delete(watchlistItems).where(eq(watchlistItems.id, itemId)).run();

    tx.insert(watchlistItems)
      .values({
        watchlistId: destinationWatchlistId,
        tmdbId: item.tmdbId,
        source: item.source,
        mediaType: item.mediaType,
        title: item.title,
        parentId: item.parentId,
        parentTitle: item.parentTitle,
        season: item.season,
        episode: item.episode,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        runtime: item.runtime,
        isWatched: item.isWatched,
        authors: item.authors,
        addedAt: item.addedAt,
      })
      .run();

    tx.update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, destinationWatchlistId))
      .run();
  });

  return {
    success: true,
    movedCount: 1,
    message: `Moved ${item.title} to ${destination.name}.`,
  };
}
