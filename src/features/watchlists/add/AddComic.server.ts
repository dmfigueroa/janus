import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import { watchlistItems } from "@/db/Schema";
import type { WatchlistMedia } from "./Mutation";
import * as repository from "@/features/watchlists/Repository.server";
import { getComicIssues } from "@/server/providers/Comicvine.server";
import { getComicVolumeDetails } from "@/integrations/comicvine/ComicvineVolume.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { rejectAdd, addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";

export async function addComicToWatchlist(
  watchlistId: number,
  volumeId: string,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE, "provider_not_configured");
  }

  const existingIssueIds = await repository.getExistingComicsInWatchlist(watchlistId);
  return fetchVolumeIssues(media, volumeId, apiKey, existingIssueIds).then(
    ({ mediaWithTitle, issues }) =>
      persistComicIssues(
        watchlistId,
        volumeId,
        mediaWithTitle,
        issues,
        existingIssueIds,
        insertionPosition,
        referenceItemId,
      ),
    (error: unknown) => providerAdditionFailure(error, "ComicVine"),
  );
}

async function fetchVolumeIssues(
  media: WatchlistMedia,
  volumeId: string,
  apiKey: string,
  existingIssueIds: Set<string>,
) {
  const mediaWithTitle = media.title
    ? media
    : { ...media, title: (await getComicVolumeDetails(volumeId, apiKey)).title };
  const issues = await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });
  return { mediaWithTitle, issues };
}

async function persistComicIssues(
  watchlistId: number,
  volumeId: string,
  media: WatchlistMedia,
  issues: Awaited<ReturnType<typeof getComicIssues>>,
  existingIssueIds: Set<string>,
  insertionPosition?: AddToWatchlistInsertionPosition,
  referenceItemId?: number,
): Promise<WatchlistWriteResult> {
  const items = mapToWatchlistComics(issues, watchlistId, volumeId, media.title);

  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items,
  });
  if (!result.success) {
    return { ...result, affectedCount: 0 };
  }

  return addedItemsResult(
    result.insertedCount,
    result.insertedCount > 0
      ? getIssuesAddedMessage(result.insertedCount, existingIssueIds.size)
      : getNoNewIssuesMessage(existingIssueIds.size),
    "no_new_items",
  );
}

// --- Implementation Details ---

function getApiKey() {
  return process.env.COMICVINE_API_KEY;
}

function mapToWatchlistComics(
  issues: Awaited<ReturnType<typeof getComicIssues>>,
  watchlistId: number,
  volumeId: string,
  parentTitle: string,
): Array<typeof watchlistItems.$inferInsert> {
  return issues.map((issue) => ({
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine",
    mediaType: "comic" as const,
    title: issue.title,
    parentId: `comicvine:${volumeId}`,
    parentTitle,
    season: null,
    episode: issue.issueNumber,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  }));
}

function getNoNewIssuesMessage(existingCount: number) {
  return existingCount > 0
    ? "No new issues found for this volume"
    : "No issues found for this volume";
}

function getIssuesAddedMessage(newCount: number, existingCount: number) {
  const prefix = existingCount > 0 ? "new " : "";
  const label = newCount === 1 ? "issue" : "issues";
  return `Added ${newCount} ${prefix}${label} to watchlist`;
}
