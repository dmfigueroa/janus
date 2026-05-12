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
    return { success: true, message: "Already in watchlist" };
  }

  let details: Awaited<ReturnType<typeof getMovieDetails>>;
  try {
    details = await getMovieDetails({ data: { id: tmdbId } });
  } catch {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const inserted = await repository.insertWatchlistItem({
    watchlistId,
    tmdbId: tmdbId.toString(),
    source: "tmdb",
    mediaType: "movie",
    title: details.title || details.name || "Unknown",
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await repository.markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}
