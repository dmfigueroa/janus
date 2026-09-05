import { persistAddedItems } from "./Insert.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import {
  fetchEpisodesAcrossSeasons,
  fetchShowDetails,
  filterNewEpisodes,
  mapToWatchlistEpisodes,
  unwrapPersistFailure,
} from "./AddTv.server";
import { rejectAdd, type WatchlistWriteResult } from "./Shared.server";

const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";

export async function addTvEpisodeToWatchlist({
  watchlistId,
  episodeId,
  parent,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  episodeId: string;
  parent: { providerId: string; title?: string };
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<WatchlistWriteResult> {
  return resolveEpisode(episodeId, parent).then(
    ({ episode, showDetails, showId }) =>
      persistEpisode({
        watchlistId,
        episode,
        showDetails,
        showId,
        parent,
        insertionPosition,
        referenceItemId,
      }),
    () => rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE),
  );
}

async function resolveEpisode(episodeId: string, parent: { providerId: string; title?: string }) {
  const showId = Number.parseInt(parent.providerId.replace(/^tmdb:/, ""), 10);
  const showDetails = await fetchShowDetails(showId);
  if (!showDetails) throw new Error(TMDB_TV_FETCH_FAILURE_MESSAGE);

  const episode = (await fetchEpisodesAcrossSeasons(showId, showDetails.seasons)).find(
    (candidate) => candidate.id.toString() === episodeId,
  );
  if (!episode) throw new Error("TMDB episode was not found for this show.");
  return { episode, showDetails, showId };
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
  episode: Awaited<ReturnType<typeof resolveEpisode>>["episode"];
  showDetails: Awaited<ReturnType<typeof resolveEpisode>>["showDetails"];
  showId: number;
  parent: { providerId: string; title?: string };
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

function showTitle(canonicalTitle: string | undefined, suppliedTitle: string | undefined) {
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
