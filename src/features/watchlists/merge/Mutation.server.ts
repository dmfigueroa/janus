import { initialWatchlistLifecycle } from "../lifecycle/WatchlistLifecycle.server";
import { mergeLineupMemberships } from "./MergeLineupMemberships.server";
import { getDb } from "@/db/Db.server";
import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { mergeWatchlistsSchema, type MergeTarget, type MergeWatchlistsInput } from "./Mutation";
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

function resolveMergeTarget(transaction: DatabaseTransaction, target: MergeTarget): number {
  switch (target.kind) {
    case "existing":
      return target.watchlistId;
    case "new":
      return createMergedWatchlist(transaction, target.name);
  }
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

function mergeParticipantIds({ target, sourceWatchlistIds }: MergeWatchlistsInput) {
  const sources = uniqueMergeParticipantIds(sourceWatchlistIds);
  if (target.kind === "new" || sources.includes(target.watchlistId)) return sources;
  return [target.watchlistId, ...sources];
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
  const targetId = resolveMergeTarget(transaction, input.target);
  const sourceIds = input.sourceWatchlistIds.filter((id) => id !== targetId);
  mergeLineupMemberships(transaction, sourceIds, targetId);
  const mergedItems = shouldUseCustomOrder
    ? mergeCustomItems(transaction, input, targetId)
    : mergeSourceItemsIntoTarget(transaction, sourceIds, targetId);
  if (mergedItems) markLastItemAddedInTransaction(transaction, targetId);
  deleteMergedSources(transaction, sourceIds);
  return { success: true, targetId };
}

function validationFailure(issues: ReadonlyArray<{ message: string }>): MergeWatchlistsResult {
  return {
    success: false,
    code: "validation_error",
    message: issues[0]?.message ?? "Invalid merge request.",
  };
}

export async function mergeWatchlistsMutation(
  input: MergeWatchlistsInput,
): Promise<MergeWatchlistsResult> {
  const parsed = mergeWatchlistsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues);
  return getDb().transaction((transaction) => mergeInTransaction(transaction, parsed.data), {
    behavior: "immediate",
  });
}
