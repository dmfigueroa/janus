import { watchlistItems } from "@/db/schema";
import type { WatchlistMedia } from "./mutation";
import * as repository from "@/features/watchlists/repository.server";
import { getComicIssues } from "@/server/providers/comicvine.server";
import type { AddToWatchlistInsertionPosition } from "./mutation";
import { persistAddedItems } from "./insert.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";
const COMICVINE_FETCH_FAILURE_MESSAGE = "Failed to fetch comic issues from ComicVine.";

export async function addComicToWatchlist(
  watchlistId: number,
  volumeId: string,
  media: WatchlistMedia,
  insertionPosition?: AddToWatchlistInsertionPosition,
): Promise<WatchlistWriteResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE);
  }

  const existingIssueIds = await repository.getExistingComicsInWatchlist(watchlistId);

  const issues = await fetchIssues(volumeId, apiKey, existingIssueIds);
  if (!issues) {
    return rejectAdd(COMICVINE_FETCH_FAILURE_MESSAGE);
  }

  if (issues.length === 0) {
    return { success: true, message: getNoNewIssuesMessage(existingIssueIds.size) };
  }

  const items = mapToWatchlistComics(issues, watchlistId, volumeId, media.title);

  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    items,
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    message: getSuccessMessage(result.insertedCount, existingIssueIds.size),
  };
}

// --- Implementation Details ---

function getApiKey() {
  return process.env.COMICVINE_API_KEY;
}

async function fetchIssues(volumeId: string, apiKey: string, existingIssueIds: Set<string>) {
  try {
    return await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });
  } catch {
    return null;
  }
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

function getSuccessMessage(newCount: number, existingCount: number) {
  const suffix = existingCount > 0 ? "new issues" : "issues";
  return `Added ${newCount} ${suffix} to watchlist`;
}
