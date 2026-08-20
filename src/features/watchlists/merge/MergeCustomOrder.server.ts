import type { DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists } from "@/db/Schema";
import { compareItemsByOrderMode } from "@/features/watchlists/Order";
import { inArray } from "drizzle-orm";

export function uniqueMergeParticipantIds(sourceWatchlistIds: number[]) {
  return Array.from(new Set(sourceWatchlistIds));
}

function buildWatchlistItemKey(item: typeof watchlistItems.$inferSelect) {
  return `${item.tmdbId}:${item.mediaType}`;
}

function loadMergeParticipants(transaction: DatabaseTransaction, orderedWatchlistIds: number[]) {
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

export function buildCustomMergedItems({
  orderedWatchlistIds,
  targetId,
  transaction,
}: {
  orderedWatchlistIds: number[];
  targetId: number;
  transaction: DatabaseTransaction;
}) {
  const mergedItems: Array<typeof watchlistItems.$inferInsert> = [];
  const mergedItemsByKey = new Map<
    string,
    typeof watchlistItems.$inferInsert & { isWatched: boolean }
  >();

  for (const participant of loadMergeParticipants(transaction, orderedWatchlistIds)) {
    for (const item of participant.items) {
      mergeCustomItem({ item, targetId, mergedItems, mergedItemsByKey });
    }
  }

  return mergedItems.map((item, index) => ({
    ...item,
    customRank: index + 1,
  }));
}

function mergeCustomItem({
  item,
  targetId,
  mergedItems,
  mergedItemsByKey,
}: {
  item: typeof watchlistItems.$inferSelect;
  targetId: number;
  mergedItems: Array<typeof watchlistItems.$inferInsert>;
  mergedItemsByKey: Map<string, typeof watchlistItems.$inferInsert & { isWatched: boolean }>;
}) {
  const key = buildWatchlistItemKey(item);
  const existing = mergedItemsByKey.get(key);
  if (existing) {
    existing.isWatched = existing.isWatched || Boolean(item.isWatched);
    return;
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
  } satisfies typeof watchlistItems.$inferInsert & { isWatched: boolean };

  mergedItems.push(mergedItem);
  mergedItemsByKey.set(key, mergedItem);
}
