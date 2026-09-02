import type { AddToWatchlistInsertionPosition, GenericMedia } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { type WatchlistWriteFailureCode, type WatchlistWriteResult } from "./Shared.server";

export async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: [mapToWatchlistItem(watchlistId, media)],
  });
  if (!result.success) {
    return {
      success: false,
      code: result.code as WatchlistWriteFailureCode,
      message: result.message,
    };
  }

  if (result.insertedCount === 0) {
    return { success: true, message: "Already in watchlist" };
  }

  return { success: true, message: "Added to watchlist" };
}

function mapToWatchlistItem(watchlistId: number, media: GenericMedia) {
  return {
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
  };
}
