import type { AddToWatchlistInsertionPosition, GenericMedia } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

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
    return { ...result, affectedCount: 0 };
  }

  if (result.insertedCount === 0) {
    return addedItemsResult(0, "Already in watchlist");
  }

  return addedItemsResult(result.insertedCount, "Added to watchlist");
}

function mapToWatchlistItem(watchlistId: number, media: GenericMedia) {
  return {
    watchlistId,
    tmdbId: media.id,
    source: media.source,
    mediaType: media.mediaType,
    title: media.title,
    parentId: media.parentId,
    parentTitle: media.parentTitle,
    episode: media.episode,
    posterPath: media.poster,
    releaseDate: media.releaseDate || media.year,
    voteAverage: media.rating,
    runtime: 0,
    authors: media.authors,
  };
}
