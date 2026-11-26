import type { Watchlist as WatchlistRecord, WatchlistItem } from "@/db/Schema";
import { watchlists, watchlistItems } from "@/db/Schema";
import { getDb } from "@/db/Db.server";
import {
  activeItemOrderExpression,
  isWatchedOrderExpression,
  watchedItemsExpression,
} from "@/features/watchlists/Order.server";
import {
  buildSummaryStats,
  emptySummaryCounts,
  emptySummarySelection,
  type SummaryCounts,
  type SummarySelection,
  type WatchlistStats,
} from "@/features/watchlists/Summary.server";
import { and, count, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

export type WatchlistSummary = WatchlistRecord & { stats: WatchlistStats };

const coverRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}
  order by ${isWatchedOrderExpression}, ${activeItemOrderExpression}
)`;
const unwatchedRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}, ${isWatchedOrderExpression}
  order by ${activeItemOrderExpression}
)`;

export async function buildWatchlistSummaries(
  db: ReturnType<typeof getDb>,
  watchlistsToSummarize: WatchlistRecord[],
): Promise<WatchlistSummary[]> {
  if (watchlistsToSummarize.length === 0) return [];

  const listIds = watchlistsToSummarize.map((watchlist) => watchlist.id);
  const [countRows, summarySelectionRows] = await Promise.all([
    loadSummaryCounts(db, listIds),
    loadSummarySelections(db, listIds),
  ]);
  const countsByWatchlist = indexSummaryCounts(countRows);
  const selectionsByWatchlist = indexSummarySelections(summarySelectionRows);

  return watchlistsToSummarize.map((watchlist) => ({
    ...watchlist,
    stats: buildSummaryStats(
      countsByWatchlist[watchlist.id] ?? emptySummaryCounts,
      selectionsByWatchlist[watchlist.id] ?? emptySummarySelection,
    ),
  }));
}

function buildRankedSummaryItemsQuery(db: ReturnType<typeof getDb>, listIds: number[]) {
  return db.$with("ranked_summary_items").as(
    db
      .select({
        ...getTableColumns(watchlistItems),
        coverRank: coverRankExpression.as("cover_rank"),
        unwatchedRank: unwatchedRankExpression.as("unwatched_rank"),
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(inArray(watchlistItems.watchlistId, listIds)),
  );
}

function loadSummaryCounts(db: ReturnType<typeof getDb>, listIds: number[]) {
  return db
    .select({
      watchlistId: watchlistItems.watchlistId,
      totalItems: count(),
      watchedItems: watchedItemsExpression,
    })
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, listIds))
    .groupBy(watchlistItems.watchlistId);
}

function loadSummarySelections(db: ReturnType<typeof getDb>, listIds: number[]) {
  const rankedSummaryItems = buildRankedSummaryItemsQuery(db, listIds);
  return db
    .with(rankedSummaryItems)
    .select()
    .from(rankedSummaryItems)
    .where(
      or(
        eq(rankedSummaryItems.coverRank, 1),
        and(
          sql`COALESCE(${rankedSummaryItems.isWatched}, 0) = 0`,
          eq(rankedSummaryItems.unwatchedRank, 1),
        ),
      ),
    );
}

function indexSummaryCounts(
  rows: Array<{ watchlistId: number; totalItems: number; watchedItems: number }>,
) {
  return rows.reduce<Record<number, SummaryCounts>>((countsByWatchlist, row) => {
    countsByWatchlist[row.watchlistId] = {
      totalItems: row.totalItems,
      watchedItems: row.watchedItems,
    };
    return countsByWatchlist;
  }, {});
}

function indexSummarySelections(
  rows: Array<WatchlistItem & { watchlistId: number; coverRank: number; unwatchedRank: number }>,
) {
  return rows.reduce<Record<number, SummarySelection>>((selectionsByWatchlist, row) => {
    const { coverRank, unwatchedRank, ...item } = row;
    const entry = (selectionsByWatchlist[item.watchlistId] ??= { ...emptySummarySelection });
    assignCoverItem(entry, item, coverRank);
    assignNextUnwatched(entry, item, unwatchedRank);
    return selectionsByWatchlist;
  }, {});
}

function assignCoverItem(entry: SummarySelection, item: WatchlistItem, coverRank: number) {
  if (coverRank === 1) entry.coverItem = item;
}

function assignNextUnwatched(entry: SummarySelection, item: WatchlistItem, unwatchedRank: number) {
  if (item.isWatched !== true && unwatchedRank === 1) entry.nextUnwatched = item;
}
