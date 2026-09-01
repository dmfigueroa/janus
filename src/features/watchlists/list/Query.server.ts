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
import { decodeWatchlistCursor, encodeWatchlistCursor } from "./WatchlistCursor.server";
import { buildListOrderBy } from "./WatchlistListOrder.server";
import { and, count, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

export type WatchlistListOrder = "createdAt" | "lastWatched" | "lastAdded" | "recency";
export type WatchlistSummary = WatchlistRecord & { stats: WatchlistStats };
export type WatchlistSummaryPage = {
  watchlists: WatchlistSummary[];
  nextCursor?: string;
};

export async function listWatchlistSummaries(
  options: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {},
): Promise<WatchlistSummary[]> {
  const { orderBy, order } = normalizeListOptions(options);
  const db = getDb();
  const lists = await db
    .select()
    .from(watchlists)
    .orderBy(...buildListOrderBy(orderBy, order));

  if (lists.length === 0) {
    return [];
  }

  const listIds = lists.map((watchlist) => watchlist.id);
  const [countRows, summarySelectionRows] = await Promise.all([
    loadSummaryCounts(db, listIds),
    loadSummarySelections(db, listIds),
  ]);

  const countsByWatchlist = indexSummaryCounts(countRows);
  const selectionsByWatchlist = indexSummarySelections(summarySelectionRows);

  return lists.map((watchlist) => ({
    ...watchlist,
    stats: buildSummaryStats(
      countsByWatchlist[watchlist.id] ?? emptySummaryCounts,
      selectionsByWatchlist[watchlist.id] ?? emptySummarySelection,
    ),
  }));
}

export async function listWatchlistSummaryPage(
  options: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
    pageSize?: number;
    cursor?: string;
  } = {},
): Promise<WatchlistSummaryPage> {
  const { orderBy, order } = normalizeListOptions(options);
  const pageSize = options.pageSize ?? 50;
  const offset = getWatchlistPageOffset(options.cursor, orderBy, order);
  const watchlists = await listWatchlistSummaries({ orderBy, order });
  return buildWatchlistSummaryPage(watchlists, pageSize, offset, orderBy, order);
}

function getWatchlistPageOffset(
  cursor: string | undefined,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
) {
  return cursor === undefined ? 0 : decodeWatchlistCursor(cursor, orderBy, order);
}

function buildWatchlistSummaryPage(
  watchlists: WatchlistSummary[],
  pageSize: number,
  offset: number,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
): WatchlistSummaryPage {
  const page = watchlists.slice(offset, offset + pageSize + 1);
  const nextCursor =
    page.length > pageSize ? encodeWatchlistCursor(offset + pageSize, orderBy, order) : undefined;

  return { watchlists: page.slice(0, pageSize), nextCursor };
}

function normalizeListOptions(options: { orderBy?: WatchlistListOrder; order?: "asc" | "desc" }) {
  return {
    orderBy: valueOrDefault(options.orderBy, "createdAt"),
    order: valueOrDefault(options.order, "desc"),
  };
}

function valueOrDefault<T>(value: T | undefined, fallback: T) {
  return value === undefined ? fallback : value;
}

const coverRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}
  order by
    ${isWatchedOrderExpression},
    ${activeItemOrderExpression}
)`;

const unwatchedRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}, ${isWatchedOrderExpression}
  order by
    ${activeItemOrderExpression}
)`;

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

async function loadSummaryCounts(db: ReturnType<typeof getDb>, listIds: number[]) {
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

async function loadSummarySelections(db: ReturnType<typeof getDb>, listIds: number[]) {
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
  return rows.reduce<Record<number, SummaryCounts>>((acc, row) => {
    acc[row.watchlistId] = {
      totalItems: row.totalItems,
      watchedItems: row.watchedItems,
    };
    return acc;
  }, {});
}

function indexSummarySelections(
  rows: Array<WatchlistItem & { watchlistId: number; coverRank: number; unwatchedRank: number }>,
) {
  return rows.reduce<Record<number, SummarySelection>>((acc, item) => {
    const entry = (acc[item.watchlistId] ??= { ...emptySummarySelection });
    assignCoverItem(entry, item);
    assignNextUnwatched(entry, item);
    return acc;
  }, {});
}

function assignCoverItem(entry: SummarySelection, item: WatchlistItem & { coverRank: number }) {
  if (item.coverRank === 1) {
    entry.coverItem = item;
  }
}

function assignNextUnwatched(
  entry: SummarySelection,
  item: WatchlistItem & { unwatchedRank: number },
) {
  if (item.isWatched !== true && item.unwatchedRank === 1) {
    entry.nextUnwatched = item;
  }
}
