import { watchlistItems } from "@/db/schema";
import type { WatchlistMedia } from "@/features/watchlists/mutations";
import * as repository from "@/features/watchlists/repository.server";
import { getComicIssues } from "@/server/providers/comicvine.server";
import { rejectAdd, type WatchlistWriteResult } from "./shared.server";

const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";
const COMICVINE_FETCH_FAILURE_MESSAGE = "Failed to fetch comic issues from ComicVine.";

export async function addComicToWatchlist(
  watchlistId: number,
  volumeId: string,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey) {
    return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE);
  }

  const existingIssueIds = await repository.getExistingComicsInWatchlist(watchlistId);
  let issues: Awaited<ReturnType<typeof getComicIssues>>;
  try {
    issues = await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });
  } catch {
    return rejectAdd(COMICVINE_FETCH_FAILURE_MESSAGE);
  }

  if (issues.length === 0) {
    return {
      success: true,
      message:
        existingIssueIds.size > 0
          ? "No new issues found for this volume"
          : "No issues found for this volume",
    };
  }

  const watchlistItemsData: Array<typeof watchlistItems.$inferInsert> = issues.map((issue) => ({
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine",
    mediaType: "comic" as const,
    title: issue.title,
    parentTitle: media.title,
    season: null,
    episode: issue.issueNumber,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  }));

  await repository.insertWatchlistItems(watchlistItemsData);
  await repository.markLastItemAdded(watchlistId);

  const newIssueCount = watchlistItemsData.length;
  const message =
    existingIssueIds.size > 0
      ? `Added ${newIssueCount} new issues to watchlist`
      : `Added ${newIssueCount} issues to watchlist`;

  return { success: true, message };
}
