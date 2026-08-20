import { getDb } from "@/db/Db.server";
import { watchlists, watchlistItems } from "@/db/Schema";
import {
  buildDetailOrderBy,
  isUnwatchedExpression,
  watchedItemsExpression,
} from "@/features/watchlists/Order.server";
import {
  buildSummaryStats,
  type SummaryCounts,
  type SummarySelection,
} from "@/features/watchlists/Summary.server";
import type { WatchlistDetailPage } from "./Query";
import { escapeLikeString } from "@/utils/Search";
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
    totalItems: numberOrZero(counts?.totalItems),
    watchedItems: numberOrZero(counts?.watchedItems),
  } satisfies SummaryCounts;
}

function numberOrZero(value: number | null | undefined) {
  return value ?? 0;
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

  const nextUnwatched = firstItemOrNull(nextUnwatchedResult);

  return {
    nextUnwatched,
    coverItem: selectCoverItem(nextUnwatched, firstItemResult),
  } satisfies SummarySelection;
}

function firstItemOrNull(items: Array<typeof watchlistItems.$inferSelect>) {
  return items[0] ?? null;
}

function selectCoverItem(
  nextUnwatched: typeof watchlistItems.$inferSelect | null,
  firstItems: Array<typeof watchlistItems.$inferSelect>,
) {
  if (nextUnwatched) {
    return nextUnwatched;
  }
  return firstItemOrNull(firstItems);
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

export async function getWatchlistDetail(
  params: GetWatchlistDetailParams,
): Promise<WatchlistDetailPage | null> {
  const { watchlistId, cursor, pageSize, query, unwatchedOnly } = normalizeDetailParams(params);
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
      stats: buildSummaryStats(counts, selectionOrEmpty(selection)),
    },
    items: pageItems,
    nextCursor: nextPageCursor(hasNextPage, cursor),
  };
}

function normalizeDetailParams(params: GetWatchlistDetailParams) {
  return {
    ...params,
    cursor: valueOrDefault(params.cursor, 1),
    pageSize: valueOrDefault(params.pageSize, 50),
  };
}

function valueOrDefault<T>(value: T | undefined, fallback: T) {
  return value === undefined ? fallback : value;
}

function selectionOrEmpty(selection: SummarySelection | null | undefined) {
  return selection ?? { nextUnwatched: null, coverItem: null };
}

function nextPageCursor(hasNextPage: boolean, cursor: number) {
  return hasNextPage ? cursor + 1 : undefined;
}
