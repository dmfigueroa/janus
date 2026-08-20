import type { AddToWatchlistInsertionPosition, GenericMedia } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { type WatchlistWriteResult } from "./Shared.server";

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
        authors: media.authors,
      },
    ],
  });
  return finishGenericAddition(result);
}

function finishGenericAddition(result: Awaited<ReturnType<typeof persistAddedItems>>) {
  if (!result.success) {
    return result;
  }

  if (result.insertedCount === 0) {
    return { success: true, message: "Already in watchlist" };
  }

  return { success: true, message: "Added to watchlist" };
}
