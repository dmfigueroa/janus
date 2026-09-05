import { addComicIssueToWatchlist } from "./AddComicIssue.server";
import { addTvEpisodeToWatchlist } from "./AddTvEpisode.server";
import type { ProviderMediaAddition } from "./AddProviderMedia";
import type { WatchlistWriteResult } from "./Shared.server";

export function addDirectChildToWatchlist(
  addition: ProviderMediaAddition,
): Promise<WatchlistWriteResult> | null {
  return addComicIssue(addition) || addTvEpisode(addition);
}

function addComicIssue(addition: ProviderMediaAddition): Promise<WatchlistWriteResult> | null {
  if (addition.provider !== "comicvine" || addition.mediaType !== "comic_issue") return null;
  return addComicIssueToWatchlist({
    watchlistId: addition.watchlistId,
    issueId: addition.providerId,
    parent: addition.parent,
    insertionPosition: addition.insertionPosition,
    referenceItemId: addition.referenceItemId,
  });
}

function addTvEpisode(addition: ProviderMediaAddition): Promise<WatchlistWriteResult> | null {
  if (addition.provider !== "tmdb" || addition.mediaType !== "episode") return null;
  return addTvEpisodeToWatchlist({
    watchlistId: addition.watchlistId,
    episodeId: addition.providerId,
    parent: addition.parent,
    insertionPosition: addition.insertionPosition,
    referenceItemId: addition.referenceItemId,
  });
}
