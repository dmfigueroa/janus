import type { GenericMedia } from "./mutation";
import * as repository from "@/features/watchlists/repository.server";
import { type WatchlistWriteResult } from "./shared.server";

export async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
): Promise<WatchlistWriteResult> {
  const inserted = await repository.insertWatchlistItem({
    watchlistId,
    tmdbId: media.id,
    source: media.source,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.poster,
    releaseDate: media.releaseDate || media.year,
    voteAverage: media.rating,
    runtime: 0,
  });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await repository.markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}
