import * as repository from "@/features/watchlists/repository.server";
import { getMovieDetails } from "@/server/providers/tmdb-api.server";
import type { AddToWatchlistInsertionPosition } from "./mutation";
import { persistAddedItems } from "./insert.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

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

  const details = await fetchMovieDetails(tmdbId);
  if (!details) {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    items: [mapToWatchlistMovie(details, watchlistId, tmdbId)],
  });

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
    title: details.title || details.name || "Unknown",
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  };
}

function alreadyInWatchlistResult(): WatchlistWriteResult {
  return { success: true, message: "Already in watchlist" };
}

function successResult(): WatchlistWriteResult {
  return { success: true, message: "Added to watchlist" };
}
