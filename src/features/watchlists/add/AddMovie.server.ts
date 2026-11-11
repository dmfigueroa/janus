import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import * as repository from "@/features/watchlists/Repository.server";
import { fetchTmdbMovie } from "@/server/providers/TmdbApi.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "@/features/watchlists/InsertOrderedItem.server";
import { addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

export async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const existing = await repository.getExistingMovieInWatchlist(watchlistId, tmdbId);
  if (existing.length > 0) {
    return addedItemsResult(0, "Already in watchlist");
  }

  return fetchTmdbMovie({ id: tmdbId }).then(
    (details) =>
      persistAddedItems({
        watchlistId,
        insertionPosition,
        referenceItemId,
        items: [mapToWatchlistMovie(details, watchlistId, tmdbId)],
      }),
    (error: unknown) => providerAdditionFailure(error, "TMDB"),
  );
}

function mapToWatchlistMovie(
  details: Awaited<ReturnType<typeof fetchTmdbMovie>>,
  watchlistId: number,
  tmdbId: number,
) {
  return {
    watchlistId,
    tmdbId: tmdbId.toString(),
    source: "tmdb" as const,
    mediaType: "movie" as const,
    title: getMovieTitle(details),
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  };
}

function getMovieTitle(details: Awaited<ReturnType<typeof fetchTmdbMovie>>) {
  if (details.title) return details.title;
  if (details.name) return details.name;
  return "Unknown";
}
