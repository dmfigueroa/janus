import * as repository from "@/features/watchlists/repository.server";
import { getMovieDetails } from "@/server/providers/tmdb-api.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

const TMDB_MOVIE_FETCH_FAILURE_MESSAGE = "Failed to fetch movie details from TMDB.";

export async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
): Promise<WatchlistWriteResult> {
  const existing = await repository.getExistingMovieInWatchlist(watchlistId, tmdbId);
  if (existing.length > 0) {
    return alreadyInWatchlist();
  }

  const details = await fetchDetails(tmdbId);
  if (!details) {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const item = mapToWatchlistItem(details, watchlistId, tmdbId);
  const inserted = await repository.insertWatchlistItem(item);

  if (!inserted) {
    return alreadyInWatchlist();
  }

  await repository.markLastItemAdded(watchlistId);

  return successResult();
}

// --- Implementation Details ---

async function fetchDetails(tmdbId: number) {
  try {
    return await getMovieDetails({ data: { id: tmdbId } });
  } catch {
    return null;
  }
}

function mapToWatchlistItem(
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

function alreadyInWatchlist(): WatchlistWriteResult {
  return { success: true, message: "Already in watchlist" };
}

function successResult(): WatchlistWriteResult {
  return { success: true, message: "Added to watchlist" };
}
