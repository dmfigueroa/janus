import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import pLimit from "p-limit";
import { watchlistItems } from "@/db/Schema";
import type { WatchlistMedia } from "./Mutation";
import * as repository from "@/features/watchlists/Repository.server";
import { fetchTmdbSeason, fetchTmdbTv, type TMDBEpisode } from "@/server/providers/TmdbApi.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

const limit = pLimit(5);

export async function addTVShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  return fetchShowEpisodes(tmdbId).then(
    ({ showDetails, episodes }) => {
      if (episodes.length === 0)
        return addedItemsResult(0, "No episodes found for this show", "no_new_items");
      const items = mapToWatchlistEpisodes(
        episodes,
        watchlistId,
        tmdbId,
        showDetails.name || media.title,
        showDetails.poster_path,
      );
      return addNewEpisodes(watchlistId, items, insertionPosition, referenceItemId);
    },
    (error: unknown) => providerAdditionFailure(error, "TMDB"),
  );
}

export async function fetchShowEpisodes(tmdbId: number) {
  const showDetails = await fetchTmdbTv({ id: tmdbId });
  const episodes = await fetchEpisodesAcrossSeasons(tmdbId, showDetails.seasons);
  return { showDetails, episodes };
}

async function addNewEpisodes(
  watchlistId: number,
  items: Array<typeof watchlistItems.$inferInsert>,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const newEpisodes = await filterNewEpisodes(watchlistId, items);
  if (newEpisodes.length === 0) {
    return addedItemsResult(0, "No new episodes found for this show", "no_new_items");
  }

  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: newEpisodes,
  });
  if (!result.success) {
    return { ...result, affectedCount: 0 };
  }

  return episodesAddedResult(result.insertedCount);
}

// --- Implementation Details ---

export async function fetchEpisodesAcrossSeasons(
  tmdbId: number,
  seasons: Array<{ season_number: number }> | undefined,
) {
  const targetSeasons = (seasons || []).filter((s) => s.season_number !== 0);

  const results = await Promise.all(
    targetSeasons.map((season) =>
      limit(() =>
        fetchTmdbSeason({ id: tmdbId, seasonNumber: season.season_number }).then(
          (sd: { episodes: TMDBEpisode[] }) => sd.episodes,
        ),
      ),
    ),
  );

  return results.flat();
}

export function mapToWatchlistEpisodes(
  episodes: TMDBEpisode[],
  watchlistId: number,
  showId: number,
  showTitle: string,
  showPoster: string | null,
): Array<typeof watchlistItems.$inferInsert> {
  return episodes.map((episode) => ({
    watchlistId,
    tmdbId: episode.id.toString(),
    source: "tmdb" as const,
    mediaType: "episode" as const,
    title: episode.name,
    parentId: `tmdb:${showId}`,
    parentTitle: showTitle,
    season: episode.season_number,
    episode: episode.episode_number.toString(),
    posterPath: episode.still_path || showPoster,
    releaseDate: episode.air_date,
    voteAverage: episode.vote_average,
    runtime: episode.runtime || 0,
  }));
}

export async function filterNewEpisodes(
  watchlistId: number,
  episodes: Array<typeof watchlistItems.$inferInsert>,
) {
  const existingIds = await repository.getExistingEpisodesInWatchlist(watchlistId);
  return episodes.filter((e) => !existingIds.has(e.tmdbId ?? ""));
}

function episodesAddedResult(count: number): WatchlistWriteResult {
  const label = count === 1 ? "new episode" : "new episodes";
  return addedItemsResult(
    count,
    count > 0 ? `Added ${count} ${label} to watchlist` : "No new episodes found for this show",
    "no_new_items",
  );
}
