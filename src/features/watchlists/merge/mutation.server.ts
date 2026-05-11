import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import type { MergeWatchlistsInput } from "@/features/watchlists/mutations";
import { hasCustomOrderMergeParticipant } from "@/features/watchlists/repository.server";
import { eq, inArray, sql } from "drizzle-orm";

type WatchlistDb = ReturnType<typeof getDb>;
type WatchlistTransaction = Parameters<Parameters<WatchlistDb["transaction"]>[0]>[0];
type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; message: string };

const CUSTOM_ORDER_MERGE_UNSUPPORTED_MESSAGE =
  "Merging custom-ordered watchlists is not supported yet.";

function assertMergeHasSources(sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    throw new Error("At least one source watchlist must be selected");
  }
}

function createMergedWatchlist(transaction: WatchlistTransaction, name: string) {
  const [newWatchlist] = transaction
    .insert(watchlists)
    .values({
      name,
      description: "Merged watchlist",
    })
    .returning()
    .all();

  return newWatchlist.id;
}

function resolveMergeTarget(
  transaction: WatchlistTransaction,
  {
    targetWatchlistId,
    newWatchlistName,
  }: Pick<MergeWatchlistsInput, "targetWatchlistId" | "newWatchlistName">,
) {
  const targetId =
    targetWatchlistId ??
    (newWatchlistName ? createMergedWatchlist(transaction, newWatchlistName) : null);

  if (!targetId) {
    throw new Error("Target watchlist ID resolution failed");
  }

  return targetId;
}

function sourceIdsToMove(sourceWatchlistIds: number[], targetId: number) {
  return sourceWatchlistIds.filter((id) => id !== targetId);
}

function mergeSourceItemsIntoTarget(
  transaction: WatchlistTransaction,
  sourceWatchlistIds: number[],
  targetId: number,
) {
  if (sourceWatchlistIds.length === 0) {
    return false;
  }

  const result = transaction
    .insert(watchlistItems)
    .select(
      transaction
        .select({
          id: sql<number | null>`NULL`.as("id"),
          watchlistId: sql<number>`${targetId}`.as("watchlistId"),
          tmdbId: watchlistItems.tmdbId,
          source: watchlistItems.source,
          mediaType: watchlistItems.mediaType,
          title: watchlistItems.title,
          parentTitle: watchlistItems.parentTitle,
          season: watchlistItems.season,
          episode: watchlistItems.episode,
          posterPath: watchlistItems.posterPath,
          releaseDate: watchlistItems.releaseDate,
          voteAverage: watchlistItems.voteAverage,
          runtime: watchlistItems.runtime,
          customRank: sql<number | null>`NULL`.as("customRank"),
          isWatched: watchlistItems.isWatched,
          addedAt: watchlistItems.addedAt,
        })
        .from(watchlistItems)
        .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds)),
    )
    .onConflictDoUpdate({
      target: [watchlistItems.watchlistId, watchlistItems.tmdbId, watchlistItems.mediaType],
      set: {
        isWatched: sql`MAX(${watchlistItems.isWatched}, excluded.is_watched)`,
      },
    })
    .run();

  return result.changes > 0;
}

function markLastItemAddedInTransaction(transaction: WatchlistTransaction, watchlistId: number) {
  transaction
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId))
    .run();
}

function deleteMergedSources(transaction: WatchlistTransaction, sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    return;
  }

  transaction.delete(watchlists).where(inArray(watchlists.id, sourceWatchlistIds)).run();
}

export async function mergeWatchlistsMutation({
  targetWatchlistId,
  sourceWatchlistIds,
  newWatchlistName,
}: MergeWatchlistsInput): Promise<MergeWatchlistsResult> {
  assertMergeHasSources(sourceWatchlistIds);

  if (await hasCustomOrderMergeParticipant({ targetWatchlistId, sourceWatchlistIds })) {
    return { success: false, message: CUSTOM_ORDER_MERGE_UNSUPPORTED_MESSAGE };
  }

  const db = getDb();
  return db.transaction((transaction) => {
    const targetId = resolveMergeTarget(transaction, { targetWatchlistId, newWatchlistName });
    const sourceIds = sourceIdsToMove(sourceWatchlistIds, targetId);
    const mergedItems = mergeSourceItemsIntoTarget(transaction, sourceIds, targetId);

    if (mergedItems) {
      markLastItemAddedInTransaction(transaction, targetId);
    }

    deleteMergedSources(transaction, sourceIds);

    return { success: true, targetId };
  });
}
