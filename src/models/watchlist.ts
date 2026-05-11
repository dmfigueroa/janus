import type { Watchlist as WatchlistRecord, WatchlistItem } from "../db/schema";
import { watchlists, watchlistItems } from "../db/schema";
import { getDb } from "../db/db.server";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import { and, asc, count, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

export type WatchlistListOrder = "createdAt" | "lastWatched" | "lastAdded";

export type WatchlistStats = {
  totalItems: number;
  watchedItems: number;
  progress: number;
  nextUnwatched: WatchlistItem | null;
  coverImage: string | null;
  coverMediaType: WatchlistItem["mediaType"] | null;
};

export type WatchlistSummary = WatchlistRecord & {
  stats: WatchlistStats;
};

export type WatchlistDetailPage = {
  watchlist: WatchlistSummary;
  items: WatchlistItem[];
  nextCursor?: number;
};

const isWatchedOrderExpression = sql<number>`CASE WHEN COALESCE(${watchlistItems.isWatched}, 0) = 1 THEN 1 ELSE 0 END`;

type SummaryCounts = Pick<WatchlistStats, "totalItems" | "watchedItems">;
type SummarySelection = {
  nextUnwatched: WatchlistItem | null;
  coverItem: WatchlistItem | null;
};

const emptySummaryCounts: SummaryCounts = {
  totalItems: 0,
  watchedItems: 0,
};

const emptySummarySelection: SummarySelection = {
  nextUnwatched: null,
  coverItem: null,
};

const activeItemOrderExpression = sql`
  CASE WHEN ${watchlists.itemOrderMode} = 'custom' AND ${watchlistItems.customRank} IS NULL THEN 1 ELSE 0 END,
  CASE WHEN ${watchlists.itemOrderMode} = 'custom' THEN ${watchlistItems.customRank} END asc,
  CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END,
  ${watchlistItems.releaseDate} asc
`;

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

const watchedItemsExpression = sql<number>`sum(case when ${watchlistItems.isWatched} then 1 else 0 end)`;

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

    if (item.coverRank === 1) {
      entry.coverItem = item;
    }

    if (item.isWatched !== true && item.unwatchedRank === 1) {
      entry.nextUnwatched = item;
    }

    return acc;
  }, {});
}

function buildSummaryStats(counts: SummaryCounts, selection: SummarySelection): WatchlistStats {
  return {
    totalItems: counts.totalItems,
    watchedItems: counts.watchedItems,
    progress: calculateWatchlistProgress(counts),
    nextUnwatched: selection.nextUnwatched,
    coverImage: selection.coverItem?.posterPath ?? null,
    coverMediaType: selection.coverItem?.mediaType ?? null,
  };
}

function buildListOrderBy(orderBy: WatchlistListOrder, order: "asc" | "desc") {
  const orderFn = order === "desc" ? desc : asc;

  switch (orderBy) {
    case "lastWatched":
      return [
        order === "desc"
          ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
          : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
        orderFn(watchlists.lastWatchedAt),
      ] as const;
    case "lastAdded":
      return [
        orderFn(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`),
      ] as const;
    case "createdAt":
    default:
      return [orderFn(watchlists.createdAt)] as const;
  }
}

export const Watchlist = {
  async listSummaries({
    orderBy = "createdAt",
    order = "desc",
  }: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {}): Promise<WatchlistSummary[]> {
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
  },

  async create({
    name,
    description,
  }: {
    name: string;
    description?: string;
  }): Promise<WatchlistRecord> {
    const db = getDb();
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name,
        description,
      })
      .returning();

    return watchlist;
  },

  async destroy(id: number): Promise<void> {
    const db = getDb();
    await db.delete(watchlists).where(eq(watchlists.id, id));
  },
};
