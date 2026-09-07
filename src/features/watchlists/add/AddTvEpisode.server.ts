import { persistAddedItems } from "./Insert.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import {
  fetchEpisodesAcrossSeasons,
  fetchShowDetails,
  filterNewEpisodes,
  mapToWatchlistEpisodes,
  unwrapPersistFailure,
  type TMDBEpisode,
} from "./AddTv.server";
import { rejectAdd, type WatchlistWriteResult } from "./Shared.server";

const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";
const TMDB_EPISODE_NOT_FOUND_MESSAGE = "TMDB episode was not found for this show.";

type ResolvedEpisode = {
  episode: TMDBEpisode;
  showDetails: NonNullable<Awaited<ReturnType<typeof fetchShowDetails>>>;
  showId: number;
};

export async function addTvEpisodeToWatchlist({
  watchlistId,
  episodeId,
  parent,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  episodeId: string;
  parent: { providerId: string; title?: string | null };
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<WatchlistWriteResult> {
  return resolveEpisode(episodeId, parent).then(
    (resolution) =>
      resolution
        ? persistEpisode({
            watchlistId,
            ...resolution,
            parent,
            insertionPosition,
            referenceItemId,
          })
        : rejectAdd(TMDB_EPISODE_NOT_FOUND_MESSAGE, "not_found"),
    () => rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE),
  );
}

async function resolveEpisode(
  episodeId: string,
  parent: { providerId: string; title?: string | null },
): Promise<ResolvedEpisode | null> {
  const showId = Number.parseInt(parent.providerId.replace(/^tmdb:/, ""), 10);
  const showDetails = await fetchShowDetails(showId);
  if (!showDetails) throw new Error(TMDB_TV_FETCH_FAILURE_MESSAGE);

  const episode = (await fetchEpisodesAcrossSeasons(showId, showDetails.seasons)).find(
    (candidate) => candidate.id.toString() === episodeId,
  );
  return episode ? { episode, showDetails, showId } : null;
}

async function persistEpisode({
  watchlistId,
  episode,
  showDetails,
  showId,
  parent,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  episode: ResolvedEpisode["episode"];
  showDetails: ResolvedEpisode["showDetails"];
  showId: number;
  parent: { providerId: string; title?: string | null };
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<WatchlistWriteResult> {
  const items = mapToWatchlistEpisodes(
    [episode],
    watchlistId,
    showId,
    showTitle(showDetails.name, parent.title),
    showDetails.poster_path,
  );
  const newEpisodes = await filterNewEpisodes(watchlistId, items);
  return newEpisodes.length === 0
    ? { success: true, message: "Already in watchlist" }
    : persistNewEpisode({
        watchlistId,
        insertionPosition,
        referenceItemId,
        items: newEpisodes,
      });
}

function showTitle(canonicalTitle: string | undefined, suppliedTitle: string | null | undefined) {
  return canonicalTitle || suppliedTitle || "Unknown Show";
}

async function persistNewEpisode({
  watchlistId,
  insertionPosition,
  referenceItemId,
  items,
}: {
  watchlistId: number;
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
  items: Awaited<ReturnType<typeof filterNewEpisodes>>;
}): Promise<WatchlistWriteResult> {
  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items,
  });
  return result.success
    ? { success: true, message: "Added 1 episode to watchlist" }
    : unwrapPersistFailure(result);
}
