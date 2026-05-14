import type { AddToWatchlistInsertionPosition, GenericMedia } from "./mutation";
import { persistAddedItems } from "./insert.server";
import { type WatchlistWriteResult } from "./shared.server";

export async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
): Promise<WatchlistWriteResult> {
  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    items: [
      {
        watchlistId,
        tmdbId: media.id,
        source: media.source,
        mediaType: media.mediaType,
        title: media.title,
        posterPath: media.poster,
        releaseDate: media.releaseDate || media.year,
        voteAverage: media.rating,
        runtime: 0,
      },
    ],
  });

  if (!result.success) {
    return result;
  }

  if (result.insertedCount === 0) {
    return { success: true, message: "Already in watchlist" };
  }

  return { success: true, message: "Added to watchlist" };
}
