import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import type { MergeWatchlistsInput } from "./mutation";
import { hasCustomOrderMergeParticipant } from "@/features/watchlists/repository.server";
import { compareItemsByOrderMode } from "@/features/watchlists/order";
import { eq, inArray, sql } from "drizzle-orm";

type WatchlistDb = ReturnType<typeof getDb>;
type WatchlistTransaction = Parameters<Parameters<WatchlistDb["transaction"]>[0]>[0];
type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; message: string };

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

function uniqueMergeParticipantIds(sourceWatchlistIds: number[]) {
  return Array.from(new Set(sourceWatchlistIds));
}

function buildWatchlistItemKey(item: typeof watchlistItems.$inferSelect) {
  return `${item.tmdbId}:${item.mediaType}`;
}

function loadMergeParticipants(transaction: WatchlistTransaction, orderedWatchlistIds: number[]) {
  const participants = uniqueMergeParticipantIds(orderedWatchlistIds);

  const participantWatchlists = transaction
    .select()
    .from(watchlists)
    .where(inArray(watchlists.id, participants))
    .all();
  const participantItems = transaction
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, participants))
    .all();

  const watchlistsById = new Map(
    participantWatchlists.map((watchlist) => [watchlist.id, watchlist]),
  );
  const itemsByWatchlistId = participantItems.reduce<
    Map<number, Array<typeof watchlistItems.$inferSelect>>
  >((acc, item) => {
    const items = acc.get(item.watchlistId) ?? [];
    items.push(item);
    acc.set(item.watchlistId, items);
    return acc;
  }, new Map());

  return orderedWatchlistIds.flatMap((watchlistId) => {
    const watchlist = watchlistsById.get(watchlistId);

    if (!watchlist) {
      return [];
    }

    const items = [...(itemsByWatchlistId.get(watchlistId) ?? [])].sort((left, right) =>
      compareItemsByOrderMode(left, right, watchlist.itemOrderMode),
    );

    return [{ watchlist, items }];
  });
}

function buildCustomMergedItems({
  orderedWatchlistIds,
  targetId,
  transaction,
}: {
  orderedWatchlistIds: number[];
  targetId: number;
  transaction: WatchlistTransaction;
}) {
  const mergedItems: Array<typeof watchlistItems.$inferInsert> = [];
  const mergedItemsByKey = new Map<
    string,
    typeof watchlistItems.$inferInsert & { isWatched: boolean }
  >();

  for (const participant of loadMergeParticipants(transaction, orderedWatchlistIds)) {
    for (const item of participant.items) {
      const key = buildWatchlistItemKey(item);
      const existing = mergedItemsByKey.get(key);

      if (existing) {
        existing.isWatched = existing.isWatched || Boolean(item.isWatched);
        continue;
      }

      const mergedItem = {
        watchlistId: targetId,
        tmdbId: item.tmdbId,
        source: item.source,
        mediaType: item.mediaType,
        title: item.title,
        parentId: item.parentId,
        parentTitle: item.parentTitle,
        season: item.season,
        episode: item.episode,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        runtime: item.runtime,
        customRank: mergedItems.length + 1,
        isWatched: Boolean(item.isWatched),
        authors: item.authors,
        addedAt: item.addedAt,
      } satisfies typeof watchlistItems.$inferInsert;

      mergedItems.push(mergedItem);
      mergedItemsByKey.set(key, mergedItem);
    }
  }

  return mergedItems.map((item, index) => ({
    ...item,
    customRank: index + 1,
  }));
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

function clearTargetItems(transaction: WatchlistTransaction, targetId: number) {
  transaction.delete(watchlistItems).where(eq(watchlistItems.watchlistId, targetId)).run();
}

function updateTargetOrderMode(
  transaction: WatchlistTransaction,
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
