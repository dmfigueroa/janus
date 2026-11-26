import { initialWatchlistLifecycle } from "../lifecycle/WatchlistLifecycle.server";
import { mergeLineupMemberships } from "./MergeLineupMemberships.server";
import { getDb } from "@/db/Db.server";
import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import type { MergeWatchlistsInput } from "./Mutation";
import { markLastItemAddedInTransaction } from "@/features/watchlists/Repository.server";
import { eq, inArray, sql } from "drizzle-orm";
import { buildCustomMergedItems, uniqueMergeParticipantIds } from "./MergeCustomOrder.server";

type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; code: "validation_error" | "not_found"; message: string };

function createMergedWatchlist(transaction: DatabaseTransaction, name: string) {
  const [newWatchlist] = transaction
    .insert(watchlists)
    .values({
      name,
      description: "Merged watchlist",
      ...initialWatchlistLifecycle(),
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
  if (targetWatchlistId !== null && targetWatchlistId !== undefined) {
    return targetWatchlistId;
  }
  return createTargetByName(transaction, newWatchlistName);
}
function createTargetByName(transaction: DatabaseTransaction, name: string | null | undefined) {
  return name ? createMergedWatchlist(transaction, name) : null;
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

function validWatchlistId(id: number) {
  return Number.isInteger(id) && id > 0;
}

function validateMergeSources(sourceWatchlistIds: number[]) {
  return sourceWatchlistIds.length > 0 && sourceWatchlistIds.every(validWatchlistId);
}

function validateExistingTarget(targetWatchlistId: number, newWatchlistName?: string) {
  return newWatchlistName === undefined && validWatchlistId(targetWatchlistId);
}

function validateMergeTarget({ targetWatchlistId, newWatchlistName }: MergeWatchlistsInput) {
  if (targetWatchlistId !== undefined)
    return validateExistingTarget(targetWatchlistId, newWatchlistName);
  return Boolean(newWatchlistName?.trim());
}

function mergeParticipantIds({ targetWatchlistId, sourceWatchlistIds }: MergeWatchlistsInput) {
  const sources = uniqueMergeParticipantIds(sourceWatchlistIds);
  if (targetWatchlistId === undefined || sources.includes(targetWatchlistId)) return sources;
  return [targetWatchlistId, ...sources];
}

function mergeCustomItems(
  transaction: DatabaseTransaction,
  input: MergeWatchlistsInput,
  targetId: number,
) {
  const mergedItemValues = buildCustomMergedItems({
    orderedWatchlistIds: mergeParticipantIds(input),
    targetId,
    transaction,
  });
  clearTargetItems(transaction, targetId);
  if (mergedItemValues.length > 0)
    transaction.insert(watchlistItems).values(mergedItemValues).run();
  updateTargetOrderMode(transaction, targetId, "custom");
  return mergedItemValues.length > 0;
}

function mergeInTransaction(
  transaction: DatabaseTransaction,
  input: MergeWatchlistsInput,
): MergeWatchlistsResult {
  const participantIds = mergeParticipantIds(input);
  const participants = transaction
    .select()
    .from(watchlists)
    .where(inArray(watchlists.id, participantIds))
    .all();
  if (participants.length !== participantIds.length) {
    return { success: false, code: "not_found", message: "One or more watchlists were not found." };
  }
  return mergeValidatedParticipants(
    transaction,
    input,
    participants.some((watchlist) => watchlist.itemOrderMode === "custom"),
  );
}

function mergeValidatedParticipants(
  transaction: DatabaseTransaction,
  input: MergeWatchlistsInput,
  shouldUseCustomOrder: boolean,
): MergeWatchlistsResult {
  const targetId = resolveMergeTarget(transaction, input);
  const sourceIds = input.sourceWatchlistIds.filter((id) => id !== targetId);
  mergeLineupMemberships(transaction, sourceIds, targetId);
  const mergedItems = shouldUseCustomOrder
    ? mergeCustomItems(transaction, input, targetId)
    : mergeSourceItemsIntoTarget(transaction, sourceIds, targetId);
  if (mergedItems) markLastItemAddedInTransaction(transaction, targetId);
  deleteMergedSources(transaction, sourceIds);
  return { success: true, targetId };
}

export async function mergeWatchlistsMutation(
  input: MergeWatchlistsInput,
): Promise<MergeWatchlistsResult> {
  if (!validateMergeSources(input.sourceWatchlistIds)) {
    return {
      success: false,
      code: "validation_error",
      message: "At least one valid source watchlist is required.",
    };
  }
  if (!validateMergeTarget(input)) {
    return {
      success: false,
      code: "validation_error",
      message: "Provide either an existing target watchlist ID or a new target name.",
    };
  }
  return getDb().transaction((transaction) => mergeInTransaction(transaction, input), {
    behavior: "immediate",
  });
}
