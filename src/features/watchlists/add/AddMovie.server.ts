import * as repository from "@/features/watchlists/Repository.server";
import { fetchTmdbMovie } from "@/server/providers/TmdbApi.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import {
  rejectAdd,
  type WatchlistWriteFailureCode,
  type WatchlistWriteResult,
} from "./Shared.server";

const TMDB_MOVIE_FETCH_FAILURE_MESSAGE = "Failed to fetch movie details from TMDB.";
const MOVIE_ALREADY_IN_WATCHLIST_RESULT = {
  success: true,
  message: "Already in watchlist",
} as const satisfies WatchlistWriteResult;
const MOVIE_ADDED_RESULT = {
  success: true,
  message: "Added to watchlist",
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

  const details = await fetchMovieDetails(tmdbId);
  if (!details) {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  return persistMovie(watchlistId, tmdbId, details, insertionPosition, referenceItemId);
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
    return {
      success: false,
      code: result.code as WatchlistWriteFailureCode,
      message: result.message,
    };
  }

  if (result.insertedCount === 0) {
    return MOVIE_ALREADY_IN_WATCHLIST_RESULT;
  }

  return MOVIE_ADDED_RESULT;
}

// --- Implementation Details ---

async function fetchMovieDetails(tmdbId: number) {
  try {
    return await fetchTmdbMovie({ id: tmdbId });
  } catch {
    return null;
  }
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
