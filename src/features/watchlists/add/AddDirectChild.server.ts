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
  if (!isComicvineAddition(addition)) return null;
  if (!isDirectComicIssue(addition)) return null;
  return addSingleComicIssue(addition);
}

function isComicvineAddition(
  addition: ProviderMediaAddition,
): addition is Extract<ProviderMediaAddition, { provider: "comicvine" }> {
  return addition.provider === "comicvine";
}

function isDirectComicIssue(addition: Extract<ProviderMediaAddition, { provider: "comicvine" }>) {
  return (
    addition.mediaType === "comic_issue" ||
    (addition.mediaType === "comic" && hasComicParent(addition))
  );
}

function hasComicParent(addition: Extract<ProviderMediaAddition, { provider: "comicvine" }>) {
  return addition.parent !== undefined && addition.parent.providerId !== undefined;
}

function addSingleComicIssue(
  addition: Extract<ProviderMediaAddition, { provider: "comicvine" }>,
): Promise<WatchlistWriteResult> {
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
