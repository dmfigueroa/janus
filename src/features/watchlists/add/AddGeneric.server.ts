import type { AddToWatchlistInsertionPosition, GenericMedia } from "./Mutation";
import { persistAddedItems } from "@/features/watchlists/InsertOrderedItem.server";
import type { WatchlistWriteResult } from "./AdditionOutcome";

export async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  return persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: [mapToWatchlistItem(watchlistId, media)],
  });
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
