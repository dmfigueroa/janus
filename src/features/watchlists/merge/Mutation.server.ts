import { getDb } from "@/db/Db.server";
import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import type { MergeWatchlistsInput } from "./Mutation";
import {
  hasCustomOrderMergeParticipant,
  markLastItemAddedInTransaction,
} from "@/features/watchlists/Repository.server";
import { eq, inArray, sql } from "drizzle-orm";
import { buildCustomMergedItems, uniqueMergeParticipantIds } from "./MergeCustomOrder.server";

type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; message: string };

function assertMergeHasSources(sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    throw new Error("At least one source watchlist must be selected");
  }
}

function createMergedWatchlist(transaction: DatabaseTransaction, name: string) {
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
  transaction: DatabaseTransaction,
  {
    targetWatchlistId,
    newWatchlistName,
  }: Pick<MergeWatchlistsInput, "targetWatchlistId" | "newWatchlistName">,
) {
  const targetId = resolveMergeTargetCandidate(transaction, targetWatchlistId, newWatchlistName);

  if (!targetId) {
    throw new Error("Target watchlist ID resolution failed");
  }

  return targetId;
}

function resolveMergeTargetCandidate(
  transaction: DatabaseTransaction,
  targetWatchlistId: number | null | undefined,
  newWatchlistName: string | null | undefined,
) {
  if (hasTargetWatchlistId(targetWatchlistId)) {
    return targetWatchlistId;
  }
  return newWatchlistName ? createMergedWatchlist(transaction, newWatchlistName) : null;
}

function hasTargetWatchlistId(
  targetWatchlistId: number | null | undefined,
): targetWatchlistId is number {
  return targetWatchlistId !== null && targetWatchlistId !== undefined;
}

function sourceIdsToMove(sourceWatchlistIds: number[], targetId: number) {
  return sourceWatchlistIds.filter((id) => id !== targetId);
}

function mergeSourceItemsIntoTarget(
  transaction: DatabaseTransaction,
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
          parentId: watchlistItems.parentId,
          parentTitle: watchlistItems.parentTitle,
          season: watchlistItems.season,
          episode: watchlistItems.episode,
          posterPath: watchlistItems.posterPath,
          releaseDate: watchlistItems.releaseDate,
          voteAverage: watchlistItems.voteAverage,
          runtime: watchlistItems.runtime,
          customRank: sql<number | null>`NULL`.as("customRank"),
          isWatched: watchlistItems.isWatched,
          authors: watchlistItems.authors,
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

function deleteMergedSources(transaction: DatabaseTransaction, sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    return;
  }

  transaction.delete(watchlists).where(inArray(watchlists.id, sourceWatchlistIds)).run();
}

function clearTargetItems(transaction: DatabaseTransaction, targetId: number) {
  transaction.delete(watchlistItems).where(eq(watchlistItems.watchlistId, targetId)).run();
}

function updateTargetOrderMode(
  transaction: DatabaseTransaction,
  targetId: number,
  itemOrderMode: (typeof watchlists.$inferInsert)["itemOrderMode"],
) {
  transaction.update(watchlists).set({ itemOrderMode }).where(eq(watchlists.id, targetId)).run();
}

export async function mergeWatchlistsMutation({
  targetWatchlistId,
  sourceWatchlistIds,
  newWatchlistName,
}: MergeWatchlistsInput): Promise<MergeWatchlistsResult> {
  assertMergeHasSources(sourceWatchlistIds);

  const shouldUseCustomOrder = await hasCustomOrderMergeParticipant({
    targetWatchlistId,
    sourceWatchlistIds,
  });

  const db = getDb();
  return db.transaction((transaction) => {
    const targetId = resolveMergeTarget(transaction, { targetWatchlistId, newWatchlistName });
    const sourceIds = sourceIdsToMove(sourceWatchlistIds, targetId);
    const mergedItems = shouldUseCustomOrder
      ? (() => {
          const mergedItemValues = buildCustomMergedItems({
            orderedWatchlistIds: uniqueMergeParticipantIds(sourceWatchlistIds),
            targetId,
            transaction,
          });

          clearTargetItems(transaction, targetId);

          if (mergedItemValues.length > 0) {
            transaction.insert(watchlistItems).values(mergedItemValues).run();
          }

          updateTargetOrderMode(transaction, targetId, "custom");
          return mergedItemValues.length > 0;
        })()
      : mergeSourceItemsIntoTarget(transaction, sourceIds, targetId);

    if (mergedItems) {
      markLastItemAddedInTransaction(transaction, targetId);
    }

    deleteMergedSources(transaction, sourceIds);

    return { success: true, targetId };
  });
}
