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
  const showDetails = await fetchShowDetails(tmdbId);
  if (!showDetails) {
    return rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE);
  }

  const episodes = await fetchEpisodesAcrossSeasons(tmdbId, showDetails.seasons);
  if (episodes.length === 0) {
    return { success: true, message: "No episodes found for this show" };
  }

  const showTitle = showDetails.name || media.title;
  const items = mapToWatchlistEpisodes(episodes, watchlistId, showTitle, showDetails.poster_path);

  const newEpisodes = await filterNewEpisodes(watchlistId, items);
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

async function fetchShowDetails(tmdbId: number) {
  try {
    return await getTVDetails({ data: { id: tmdbId } });
  } catch {
    return null;
  }
}

async function fetchEpisodesAcrossSeasons(
  tmdbId: number,
  seasons: Array<{ season_number: number }> | undefined,
) {
  const targetSeasons = (seasons || []).filter((s) => s.season_number !== 0);

  const results = await Promise.all(
    targetSeasons.map((season) =>
      limit(() =>
        getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
          (sd: { episodes: TMDBEpisode[] }) => sd.episodes,
        ),
      ),
    ),
  );

  return results.flat();
}

function mapToWatchlistEpisodes(
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
