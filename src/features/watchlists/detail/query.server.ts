import { getDb } from "@/db/db.server";
import { watchlists, watchlistItems } from "@/db/schema";
import {
  buildDetailOrderBy,
  isUnwatchedExpression,
  watchedItemsExpression,
} from "@/features/watchlists/order.server";
import {
  buildSummaryStats,
  type SummaryCounts,
  type SummarySelection,
} from "@/features/watchlists/summary.server";
import type { WatchlistDetailPage } from "@/models/watchlist";
import { escapeLikeString } from "@/utils/search";
import { and, count, eq, or, sql } from "drizzle-orm";

export type GetWatchlistDetailParams = {
  watchlistId: number;
  cursor?: number;
  pageSize?: number;
  query?: string;
  unwatchedOnly?: boolean;
};

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

async function loadDetailSelection({
  db,
  watchlistId,
  itemOrderMode,
}: {
  db: ReturnType<typeof getDb>;
  watchlistId: number;
  itemOrderMode: (typeof watchlists.$inferSelect)["itemOrderMode"];
}) {
  const itemOrder = buildDetailOrderBy(itemOrderMode);
  const [nextUnwatchedResult, firstItemResult] = await Promise.all([
    db
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), isUnwatchedExpression))
      .orderBy(...itemOrder)
      .limit(1),
    db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(...itemOrder)
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
  itemOrderMode,
}: GetWatchlistDetailParams & {
  db: ReturnType<typeof getDb>;
  cursor: number;
  pageSize: number;
  itemOrderMode: (typeof watchlists.$inferSelect)["itemOrderMode"];
}) {
  const offset = (cursor - 1) * pageSize;

  return db
    .select()
    .from(watchlistItems)
    .where(buildDetailFilters({ watchlistId, query, unwatchedOnly }))
    .orderBy(...buildDetailOrderBy(itemOrderMode))
    .limit(pageSize + 1)
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
    loadDetailSelection({ db, watchlistId, itemOrderMode: watchlist.itemOrderMode }),
    loadDetailItems({
      db,
      watchlistId,
      cursor,
      pageSize,
      query,
      unwatchedOnly,
      itemOrderMode: watchlist.itemOrderMode,
    }),
  ]);
  const pageItems = items.slice(0, pageSize);
  const hasNextPage = items.length > pageSize;

  return {
    watchlist: {
      ...watchlist,
      stats: buildSummaryStats(counts, selection ?? { nextUnwatched: null, coverItem: null }),
    },
    items: pageItems,
    nextCursor: hasNextPage ? cursor + 1 : undefined,
  };
}
