import { getDb } from "@/db/db.server";
import { watchlists, watchlistItems, type WatchlistItem } from "@/db/schema";
import { calculateWatchlistProgress } from "@/features/watchlists/progress";
import type { WatchlistDetailPage, WatchlistStats, WatchlistSummary } from "@/models/watchlist";
import { escapeLikeString } from "@/utils/search";
import { and, asc, count, eq, or, sql } from "drizzle-orm";

export type GetWatchlistDetailParams = {
  watchlistId: number;
  cursor?: number;
  pageSize?: number;
  query?: string;
  unwatchedOnly?: boolean;
};

type SummaryCounts = Pick<WatchlistStats, "totalItems" | "watchedItems">;
type SummarySelection = {
  nextUnwatched: WatchlistItem | null;
  coverItem: WatchlistItem | null;
};

const releaseDateOrder = [
  sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
  asc(watchlistItems.releaseDate),
] as const;

const isUnwatchedExpression = sql<boolean>`COALESCE(${watchlistItems.isWatched}, 0) = 0`;
const watchedItemsExpression = sql<number>`sum(case when ${watchlistItems.isWatched} then 1 else 0 end)`;

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

async function loadWatchlistById(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, watchlistId));
  return watchlist ?? null;
}

async function loadDetailCounts(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [counts] = await db
    .select({
      totalItems: count(),
      watchedItems: watchedItemsExpression,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId));

  return {
    totalItems: counts?.totalItems ?? 0,
    watchedItems: counts?.watchedItems ?? 0,
  } satisfies SummaryCounts;
}

async function loadDetailSelection(db: ReturnType<typeof getDb>, watchlistId: number) {
  const [nextUnwatchedResult, firstItemResult] = await Promise.all([
    db
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), isUnwatchedExpression))
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
    unwatchedOnly ? isUnwatchedExpression : undefined,
    query
      ? or(
          sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.episode} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
        )
      : undefined,
  );
}

async function loadDetailItems({
  db,
  watchlistId,
  cursor,
  pageSize,
  query,
  unwatchedOnly,
}: GetWatchlistDetailParams & {
  db: ReturnType<typeof getDb>;
  cursor: number;
  pageSize: number;
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

export async function getWatchlistDetail({
  watchlistId,
  cursor = 1,
  pageSize = 50,
  query,
  unwatchedOnly,
}: GetWatchlistDetailParams): Promise<WatchlistDetailPage | null> {
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
    } satisfies WatchlistSummary,
    items,
    nextCursor: items.length === pageSize ? cursor + 1 : undefined,
  };
}
