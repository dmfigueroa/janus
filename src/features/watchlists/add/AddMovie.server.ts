import * as repository from "@/features/watchlists/Repository.server";
import { getMovieDetails } from "@/server/providers/TmdbApi.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { rejectAdd, type WatchlistWriteResult } from "./Shared.server";

const TMDB_MOVIE_FETCH_FAILURE_MESSAGE = "Failed to fetch movie details from TMDB.";

export async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
  insertionPosition?: AddToWatchlistInsertionPosition,
): Promise<WatchlistWriteResult> {
  const existing = await repository.getExistingMovieInWatchlist(watchlistId, tmdbId);
  if (existing.length > 0) {
    return alreadyInWatchlistResult();
  }

  return addFetchedMovie(watchlistId, tmdbId, insertionPosition);
}

async function addFetchedMovie(
  watchlistId: number,
  tmdbId: number,
  insertionPosition?: AddToWatchlistInsertionPosition,
): Promise<WatchlistWriteResult> {
  const details = await fetchMovieDetails(tmdbId);
  if (!details) {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    items: [mapToWatchlistMovie(details, watchlistId, tmdbId)],
  });
  return finishMovieAddition(result);
}

function finishMovieAddition(result: Awaited<ReturnType<typeof persistAddedItems>>) {
  if (!result.success) {
    return result;
  }

  if (result.insertedCount === 0) {
    return alreadyInWatchlistResult();
  }

  return successResult();
}

// --- Implementation Details ---

async function fetchMovieDetails(tmdbId: number) {
  try {
    return await getMovieDetails({ data: { id: tmdbId } });
  } catch {
    return null;
  }
}

function mapToWatchlistMovie(
  details: Awaited<ReturnType<typeof getMovieDetails>>,
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

function getMovieTitle(details: Awaited<ReturnType<typeof getMovieDetails>>) {
  if (details.title) return details.title;
  if (details.name) return details.name;
  return "Unknown";
}

function alreadyInWatchlistResult(): WatchlistWriteResult {
  return { success: true, message: "Already in watchlist" };
}

function successResult(): WatchlistWriteResult {
  return { success: true, message: "Added to watchlist" };
}
