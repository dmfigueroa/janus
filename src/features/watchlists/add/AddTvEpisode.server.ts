import type { TMDBEpisode } from "@/server/providers/TmdbApi.server";
import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import { persistAddedItems } from "@/features/watchlists/InsertOrderedItem.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { fetchShowEpisodes, filterNewEpisodes, mapToWatchlistEpisodes } from "./AddTv.server";
import { rejectAdd, type WatchlistWriteResult } from "./AdditionOutcome";

const TMDB_EPISODE_NOT_FOUND_MESSAGE = "TMDB episode was not found for this show.";

type ResolvedEpisode = {
  episode: TMDBEpisode;
  showDetails: Awaited<ReturnType<typeof fetchShowEpisodes>>["showDetails"];
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
    (error: unknown) => providerAdditionFailure(error, "TMDB"),
  );
}

async function resolveEpisode(
  episodeId: string,
  parent: { providerId: string; title?: string | null },
): Promise<ResolvedEpisode | null> {
  const showId = Number.parseInt(parent.providerId.replace(/^tmdb:/, ""), 10);
  const { showDetails, episodes } = await fetchShowEpisodes(showId);
  const episode = episodes.find((candidate) => candidate.id.toString() === episodeId);
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
  return persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: newEpisodes,
    addedMessage: "Added 1 episode to watchlist",
  });
}

function showTitle(canonicalTitle: string | undefined, suppliedTitle: string | null | undefined) {
  return canonicalTitle || suppliedTitle || "Unknown Show";
}
