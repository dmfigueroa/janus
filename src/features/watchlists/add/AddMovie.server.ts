import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import * as repository from "@/features/watchlists/Repository.server";
import { fetchTmdbMovie } from "@/server/providers/TmdbApi.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./InsertWatchlistItems.server";
import { addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

const MOVIE_ALREADY_IN_WATCHLIST_RESULT = {
  success: true,
  code: "duplicate",
  affectedCount: 0,
  message: "Already in watchlist",
} as const satisfies WatchlistWriteResult;
export async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const existing = await repository.getExistingMovieInWatchlist(watchlistId, tmdbId);
  if (existing.length > 0) {
    return MOVIE_ALREADY_IN_WATCHLIST_RESULT;
  }

  return fetchTmdbMovie({ id: tmdbId }).then(
    (details) => persistMovie(watchlistId, tmdbId, details, insertionPosition, referenceItemId),
    (error: unknown) => providerAdditionFailure(error, "TMDB"),
  );
}

async function persistMovie(
  watchlistId: number,
  tmdbId: number,
  details: Awaited<ReturnType<typeof fetchTmdbMovie>>,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: [mapToWatchlistMovie(details, watchlistId, tmdbId)],
  });
  if (!result.success) {
    return { ...result, affectedCount: 0 };
  }

  if (result.insertedCount === 0) {
    return MOVIE_ALREADY_IN_WATCHLIST_RESULT;
  }

  return addedItemsResult(result.insertedCount, "Added to watchlist");
}

// --- Implementation Details ---

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
