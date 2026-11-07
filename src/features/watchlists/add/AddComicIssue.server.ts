import { providerAdditionFailure } from "./ProviderAdditionFailure.server";
import { watchlistItems } from "@/db/Schema";
import { getComicIssue } from "@/integrations/comicvine/ComicvineIssueDetail.server";
import type { AddToWatchlistInsertionPosition } from "./Mutation";
import { persistAddedItems } from "./Insert.server";
import { rejectAdd, addedItemsResult, type WatchlistWriteResult } from "./AdditionOutcome";

const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";

export async function addComicIssueToWatchlist({
  watchlistId,
  issueId,
  parent,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  issueId: string;
  parent?: { providerId?: string | null; title?: string | null };
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<WatchlistWriteResult> {
  const apiKey = process.env.COMICVINE_API_KEY;
  if (!apiKey) return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE, "provider_not_configured");

  return getComicIssue(issueId, apiKey).then(
    (issue) =>
      persistComicIssue({ watchlistId, issue, parent, insertionPosition, referenceItemId }),
    (error: unknown) => providerAdditionFailure(error, "ComicVine"),
  );
}

async function persistComicIssue({
  watchlistId,
  issue,
  parent,
  insertionPosition,
  referenceItemId,
}: {
  watchlistId: number;
  issue: Awaited<ReturnType<typeof getComicIssue>>;
  parent?: { providerId?: string | null; title?: string | null };
  insertionPosition?: AddToWatchlistInsertionPosition;
  referenceItemId?: number;
}): Promise<WatchlistWriteResult> {
  const result = await persistAddedItems({
    watchlistId,
    insertionPosition,
    referenceItemId,
    items: [mapIssueToWatchlistItem(watchlistId, issue, parent)],
  });
  if (!result.success) return { ...result, affectedCount: 0 };
  return addedItemsResult(
    result.insertedCount,
    result.insertedCount === 0 ? "Already in watchlist" : "Added 1 issue to watchlist",
  );
}

function mapIssueToWatchlistItem(
  watchlistId: number,
  issue: Awaited<ReturnType<typeof getComicIssue>>,
  parent?: { providerId?: string | null; title?: string | null },
): typeof watchlistItems.$inferInsert {
  return {
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine",
    mediaType: "comic",
    title: issue.title,
    parentId: `comicvine:${parentProviderId(issue, parent)}`,
    parentTitle: parentTitle(issue, parent),
    season: null,
    episode: issue.issueNumber,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  };
}

function parentProviderId(
  issue: Awaited<ReturnType<typeof getComicIssue>>,
  parent?: { providerId?: string | null },
) {
  return issue.parent.id || parent?.providerId;
}

function parentTitle(
  issue: Awaited<ReturnType<typeof getComicIssue>>,
  parent?: { title?: string | null },
) {
  return [issue.parent.title, parent?.title, "Unknown Volume"].find(Boolean) as string;
}
