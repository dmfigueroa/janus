import pLimit from "p-limit";
import { watchlistItems } from "@/db/schema";
import type { WatchlistMedia } from "@/features/watchlists/mutations";
import * as repository from "@/features/watchlists/repository.server";
import { getSeasonDetails, getTVDetails } from "@/server/providers/tmdb-api.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

const limit = pLimit(5);
const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";

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

const formatCount = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

export async function addTVShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  let showDetails: Awaited<ReturnType<typeof getTVDetails>>;
  let allEpisodes: Array<typeof watchlistItems.$inferInsert>;

  try {
    showDetails = await getTVDetails({ data: { id: tmdbId } });
    const showTitle = showDetails.name || media.title;
    const seasons = showDetails.seasons || [];
    const seasonEpisodeLists = await Promise.all(
      seasons
        .filter((season: { season_number: number }) => season.season_number !== 0)
        .map((season: { season_number: number }) =>
          limit(() =>
            getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
              (seasonDetails: { episodes: TMDBEpisode[] }) => seasonDetails.episodes,
            ),
          ),
        ),
    );

    allEpisodes = seasonEpisodeLists.flat().map((episode) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle: showTitle,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    }));
  } catch {
    return rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE);
  }

  if (allEpisodes.length === 0) {
    return { success: true, message: "No episodes found for this show" };
  }

  const existingEpisodeIds = await repository.getExistingEpisodesInWatchlist(watchlistId);
  const newEpisodes = allEpisodes.filter(
    (episode) => !existingEpisodeIds.has(episode.tmdbId ?? ""),
  );

  if (newEpisodes.length === 0) {
    return { success: true, message: "No new episodes found for this show" };
  }

  await repository.insertWatchlistItems(newEpisodes);
  await repository.markLastItemAdded(watchlistId);

  return {
    success: true,
    message: `Added ${formatCount(newEpisodes.length, "new episode", "new episodes")} to watchlist`,
  };
}
