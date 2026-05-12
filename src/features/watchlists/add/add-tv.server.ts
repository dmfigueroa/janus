import pLimit from "p-limit";
import { watchlistItems } from "@/db/schema";
import type { WatchlistMedia } from "@/features/watchlists/mutations";
import * as repository from "@/features/watchlists/repository.server";
import { getSeasonDetails, getTVDetails } from "@/server/providers/tmdb-api.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

const limit = pLimit(5);
const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";

export async function addTVShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  const allEpisodes = await fetchAndMapAllEpisodes(watchlistId, tmdbId, media.title);
  if (!allEpisodes) {
    return rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE);
  }

  if (allEpisodes.length === 0) {
    return { success: true, message: "No episodes found for this show" };
  }

  const newEpisodes = await filterNewEpisodes(watchlistId, allEpisodes);
  if (newEpisodes.length === 0) {
    return { success: true, message: "No new episodes found for this show" };
  }

  await repository.insertWatchlistItems(newEpisodes);
  await repository.markLastItemAdded(watchlistId);

  return successResult(newEpisodes.length);
}

// --- Implementation Details ---

type TMDBEpisode = {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  still_path: string | null;
  air_date?: string;
  vote_average: number;
  runtime?: number | null;
};

async function fetchAndMapAllEpisodes(watchlistId: number, tmdbId: number, searchTitle: string) {
  try {
    const showDetails = await getTVDetails({ data: { id: tmdbId } });
    const showTitle = showDetails.name || searchTitle;
    const seasons = (showDetails.seasons || []).filter(
      (s: { season_number: number }) => s.season_number !== 0,
    );

    const episodes = await Promise.all(
      seasons.map((season: { season_number: number }) =>
        limit(() =>
          getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
            (sd: { episodes: TMDBEpisode[] }) => sd.episodes,
          ),
        ),
      ),
    );

    return mapEpisodes(episodes.flat(), watchlistId, showTitle, showDetails.poster_path);
  } catch {
    return null;
  }
}

function mapEpisodes(
  episodes: TMDBEpisode[],
  watchlistId: number,
  showTitle: string,
  showPoster: string | null,
): Array<typeof watchlistItems.$inferInsert> {
  return episodes.map((episode) => ({
    watchlistId,
    tmdbId: episode.id.toString(),
    source: "tmdb" as const,
    mediaType: "episode" as const,
    title: episode.name,
    parentTitle: showTitle,
    season: episode.season_number,
    episode: episode.episode_number.toString(),
    posterPath: episode.still_path || showPoster,
    releaseDate: episode.air_date,
    voteAverage: episode.vote_average,
    runtime: episode.runtime || 0,
  }));
}

async function filterNewEpisodes(
  watchlistId: number,
  episodes: Array<typeof watchlistItems.$inferInsert>,
) {
  const existingIds = await repository.getExistingEpisodesInWatchlist(watchlistId);
  return episodes.filter((e) => !existingIds.has(e.tmdbId ?? ""));
}

function successResult(count: number): WatchlistWriteResult {
  const label = count === 1 ? "new episode" : "new episodes";
  return {
    success: true,
    message: `Added ${count} ${label} to watchlist`,
  };
}
