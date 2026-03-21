"use server";

import type { Watchlist as WatchlistRecord, WatchlistItem } from "../db/schema";
import { watchlists, watchlistItems } from "../db/schema";
import { getDb } from "../db/db.server";
import { escapeLikeString } from "../utils/search";
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

const releaseDateOrder = [
  sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
  asc(watchlistItems.releaseDate),
] as const;

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

const coverRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}
  order by
    CASE WHEN ${watchlistItems.isWatched} THEN 1 ELSE 0 END,
    CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END,
    ${watchlistItems.releaseDate} asc
)`;

const unwatchedRankExpression = sql<number>`row_number() over (
  partition by ${watchlistItems.watchlistId}, ${watchlistItems.isWatched}
  order by
    CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END,
    ${watchlistItems.releaseDate} asc
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
        and(eq(rankedSummaryItems.isWatched, false), eq(rankedSummaryItems.unwatchedRank, 1)),
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

    if (!item.isWatched && item.unwatchedRank === 1) {
      entry.nextUnwatched = item;
    }

    return acc;
  }, {});
}

function buildSummaryStats(counts: SummaryCounts, selection: SummarySelection): WatchlistStats {
  return {
    totalItems: counts.totalItems,
    watchedItems: counts.watchedItems,
    progress:
      counts.totalItems > 0 ? Math.round((counts.watchedItems / counts.totalItems) * 100) : 0,
    nextUnwatched: selection.nextUnwatched,
    coverImage: selection.coverItem?.posterPath ?? null,
    coverMediaType: selection.coverItem?.mediaType ?? null,
  };
}

async function loadWatchlistById(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, watchlistId));
  return watchlist ?? null;
}

async function loadDetailCounts(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [totalResult, watchedResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId)),
    db
      .select({ count: count() })
      .from(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.isWatched, true))),
  ]);

  return {
    totalItems: totalResult[0]?.count ?? 0,
    watchedItems: watchedResult[0]?.count ?? 0,
  } satisfies SummaryCounts;
}

async function loadDetailSelection(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [nextUnwatchedResult, firstItemResult] = await Promise.all([
    db
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.isWatched, false)))
      .orderBy(...releaseDateOrder)
      .limit(1),
    db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(...releaseDateOrder)
      .limit(1),
  ]);

  const nextUnwatched = nextUnwatchedResult[0] ?? null;

  return {
    nextUnwatched,
    coverItem: nextUnwatched ?? firstItemResult[0] ?? null,
  } satisfies SummarySelection;
}

async function loadDetailItems({
  db,
  watchlistId,
  cursor,
  pageSize,
  query,
  unwatchedOnly,
}: {
  db: ReturnType<typeof getDb>;
  watchlistId: number;
  cursor: number;
  pageSize: number;
  query?: string;
  unwatchedOnly?: boolean;
}) {
  const offset = (cursor - 1) * pageSize;

  return db
    .select()
    .from(watchlistItems)
    .where(buildDetailFilters({ watchlistId, query, unwatchedOnly }))
    .orderBy(...releaseDateOrder)
    .limit(pageSize)
    .offset(offset);
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

function buildDetailFilters({
  watchlistId,
  query,
  unwatchedOnly,
}: {
  watchlistId: number;
  query?: string;
  unwatchedOnly?: boolean;
}) {
  return and(
    eq(watchlistItems.watchlistId, watchlistId),
    unwatchedOnly ? eq(watchlistItems.isWatched, false) : undefined,
    query
      ? or(
          sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.episode} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
        )
      : undefined,
  );
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

  async getDetail({
    watchlistId,
    cursor = 1,
    pageSize = 50,
    query,
    unwatchedOnly,
  }: {
    watchlistId: number;
    cursor?: number;
    pageSize?: number;
    query?: string;
    unwatchedOnly?: boolean;
  }): Promise<WatchlistDetailPage | null> {
    const db = getDb();
    const watchlist = await loadWatchlistById(db, watchlistId);

    if (!watchlist) {
      return null;
    }

    const [counts, selection, items] = await Promise.all([
      loadDetailCounts(db, watchlistId),
      loadDetailSelection(db, watchlistId),
      loadDetailItems({ db, watchlistId, cursor, pageSize, query, unwatchedOnly }),
    ]);

    return {
      watchlist: {
        ...watchlist,
        stats: buildSummaryStats(counts, selection),
      },
      items,
      nextCursor: items.length === pageSize ? cursor + 1 : undefined,
    };
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

  async merge({
    targetWatchlistId,
    sourceWatchlistIds,
    newWatchlistName,
  }: {
    targetWatchlistId?: number;
    sourceWatchlistIds: number[];
    newWatchlistName?: string;
  }): Promise<{ targetId: number }> {
    const db = getDb();
    let targetId = targetWatchlistId;

    if (newWatchlistName && !targetId) {
      const [newWatchlist] = await db
        .insert(watchlists)
        .values({
          name: newWatchlistName,
          description: "Merged watchlist",
        })
        .returning();
      targetId = newWatchlist.id;
    }

    if (!targetId) {
      throw new Error("Target watchlist ID resolution failed");
    }

    const sourceItems = await db
      .select()
      .from(watchlistItems)
      .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds));

    if (sourceItems.length > 0) {
      const itemsToInsert = sourceItems.map((item) => ({
        watchlistId: targetId,
        tmdbId: item.tmdbId,
        source: item.source,
        mediaType: item.mediaType,
        title: item.title,
        parentTitle: item.parentTitle,
        season: item.season,
        episode: item.episode,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        runtime: item.runtime,
        isWatched: item.isWatched,
        addedAt: item.addedAt,
      }));

      const chunkSize = 50;
      for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
        const chunk = itemsToInsert.slice(i, i + chunkSize);

        await db
          .insert(watchlistItems)
          .values(chunk)
          .onConflictDoUpdate({
            target: [watchlistItems.watchlistId, watchlistItems.tmdbId, watchlistItems.mediaType],
            set: {
              isWatched: sql`CASE WHEN ${watchlistItems.isWatched} OR excluded.is_watched THEN 1 ELSE 0 END`,
            },
          });
      }

      await db
        .update(watchlists)
        .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, targetId));
    }

    const sourcesToDelete = sourceWatchlistIds.filter((id) => id !== targetId);
    if (sourcesToDelete.length > 0) {
      await db.delete(watchlists).where(inArray(watchlists.id, sourcesToDelete));
    }

    return { targetId };
  },
};
