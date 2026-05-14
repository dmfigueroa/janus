import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import type { MergeWatchlistsInput } from "./mutation";
import {
  buildMergedCustomSequence,
  getWatchlistItemMergeKey,
  hasCustomOrderedItems,
} from "@/features/watchlists/custom-order.server";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { WatchlistItemOrderMode } from "@/features/watchlists/order";

type WatchlistDb = ReturnType<typeof getDb>;
type WatchlistTransaction = Parameters<Parameters<WatchlistDb["transaction"]>[0]>[0];
type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; message: string };
type MergeWatchlist = Pick<typeof watchlists.$inferSelect, "id" | "itemOrderMode">;
type MergeTargetResolutionInput = Pick<
  MergeWatchlistsInput,
  "targetWatchlistId" | "newWatchlistName"
> & {
  newWatchlistItemOrderMode: WatchlistItemOrderMode;
};

function assertMergeHasSources(sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    throw new Error("At least one source watchlist must be selected");
  }
}

function createMergedWatchlist(
  transaction: WatchlistTransaction,
  name: string,
  itemOrderMode: WatchlistItemOrderMode,
) {
  const [newWatchlist] = transaction
    .insert(watchlists)
    .values({
      name,
      description: "Merged watchlist",
      itemOrderMode,
    })
    .returning()
    .all();

  return newWatchlist.id;
}

function resolveMergeTarget(
  transaction: WatchlistTransaction,
  { targetWatchlistId, newWatchlistName, newWatchlistItemOrderMode }: MergeTargetResolutionInput,
) {
  const targetId =
    targetWatchlistId ??
    (newWatchlistName
      ? createMergedWatchlist(transaction, newWatchlistName, newWatchlistItemOrderMode)
      : null);

  if (!targetId) {
    throw new Error("Target watchlist ID resolution failed");
  }

  return targetId;
}

function sourceIdsToMove(sourceWatchlistIds: number[], targetId: number) {
  return sourceWatchlistIds.filter((id) => id !== targetId);
}

function loadWatchlistsById(transaction: WatchlistTransaction, ids: number[]) {
  if (ids.length === 0) {
    return new Map<number, MergeWatchlist>();
  }

  const rows = transaction
    .select({
      id: watchlists.id,
      itemOrderMode: watchlists.itemOrderMode,
    })
    .from(watchlists)
    .where(inArray(watchlists.id, ids))
    .all();

  return new Map(rows.map((row) => [row.id, row]));
}

function loadItemsByWatchlistId(transaction: WatchlistTransaction, ids: number[]) {
  if (ids.length === 0) {
    return new Map<number, Array<typeof watchlistItems.$inferSelect>>();
  }

  const rows = transaction
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, ids))
    .all();

  const itemsByWatchlistId = new Map<number, Array<typeof watchlistItems.$inferSelect>>();

  for (const row of rows) {
    const entry = itemsByWatchlistId.get(row.watchlistId);

    if (entry) {
      entry.push(row);
      continue;
    }

    itemsByWatchlistId.set(row.watchlistId, [row]);
  }

  return itemsByWatchlistId;
}

function applyMergedItemsToTarget(
  transaction: WatchlistTransaction,
  targetId: number,
  {
    target,
    sources,
  }: {
    target?: {
      itemOrderMode: WatchlistItemOrderMode;
      items: Array<typeof watchlistItems.$inferSelect>;
    };
    sources: Array<{
      itemOrderMode: WatchlistItemOrderMode;
      items: Array<typeof watchlistItems.$inferSelect>;
    }>;
  },
) {
  const shouldAssignCustomRanks = hasCustomOrderedItems([...(target ? [target] : []), ...sources]);
  const mergedItems = buildMergedCustomSequence({ target, sources });
  const existingTargetItemsByKey = new Map(
    (target?.items ?? []).map((item) => [getWatchlistItemMergeKey(item), item]),
  );
  let didChangeTarget = false;

  for (const mergedItem of mergedItems) {
    const existingTargetItem = existingTargetItemsByKey.get(getWatchlistItemMergeKey(mergedItem));

    if (existingTargetItem) {
      const nextIsWatched = existingTargetItem.isWatched || mergedItem.isWatched;
      const nextCustomRank = shouldAssignCustomRanks
        ? mergedItem.customRank
        : existingTargetItem.customRank;
      const shouldUpdate =
        nextIsWatched !== existingTargetItem.isWatched ||
        nextCustomRank !== existingTargetItem.customRank;

      if (!shouldUpdate) {
        continue;
      }

      transaction
        .update(watchlistItems)
        .set({
          isWatched: nextIsWatched,
          customRank: nextCustomRank,
        })
        .where(
          and(
            eq(watchlistItems.id, existingTargetItem.id),
            eq(watchlistItems.watchlistId, targetId),
          ),
        )
        .run();

      didChangeTarget = true;
      continue;
    }

    transaction
      .insert(watchlistItems)
      .values({
        watchlistId: targetId,
        tmdbId: mergedItem.tmdbId,
        source: mergedItem.source,
        mediaType: mergedItem.mediaType,
        title: mergedItem.title,
        parentTitle: mergedItem.parentTitle,
        season: mergedItem.season,
        episode: mergedItem.episode,
        posterPath: mergedItem.posterPath,
        releaseDate: mergedItem.releaseDate,
        voteAverage: mergedItem.voteAverage,
        runtime: mergedItem.runtime,
        customRank: shouldAssignCustomRanks ? mergedItem.customRank : null,
        isWatched: mergedItem.isWatched,
        addedAt: mergedItem.addedAt,
      })
      .run();

    didChangeTarget = true;
  }

  return didChangeTarget;
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

  const db = getDb();
  return db.transaction((transaction) => {
    const sourceWatchlists = loadWatchlistsById(transaction, sourceWatchlistIds);
    const targetId = resolveMergeTarget(transaction, {
      targetWatchlistId,
      newWatchlistName,
      newWatchlistItemOrderMode: Array.from(sourceWatchlists.values()).some(
        (watchlist) => watchlist.itemOrderMode === "custom",
      )
        ? "custom"
        : "release",
    });
    const sourceIds = sourceIdsToMove(sourceWatchlistIds, targetId);
    const participantIds = Array.from(new Set([targetId, ...sourceIds]));
    const watchlistsById = loadWatchlistsById(transaction, participantIds);
    const targetWatchlist = watchlistsById.get(targetId);

    if (!targetWatchlist) {
      return { success: false, message: "Target watchlist not found." };
    }

    const itemsByWatchlistId = loadItemsByWatchlistId(transaction, participantIds);
    const mergedItems = applyMergedItemsToTarget(transaction, targetId, {
      target: {
        itemOrderMode: targetWatchlist.itemOrderMode,
        items: itemsByWatchlistId.get(targetId) ?? [],
      },
      sources: sourceIds.map((id) => ({
        itemOrderMode: watchlistsById.get(id)?.itemOrderMode ?? "release",
        items: itemsByWatchlistId.get(id) ?? [],
      })),
    });

    if (mergedItems) {
      markLastItemAddedInTransaction(transaction, targetId);
    }

    deleteMergedSources(transaction, sourceIds);

    return { success: true, targetId };
  });
}
