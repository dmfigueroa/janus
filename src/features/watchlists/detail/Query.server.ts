import { and, count, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems, watchlists, type Watchlist, type WatchlistItem } from "@/db/Schema";
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
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { escapeLikeString } from "@/utils/Search";
import type { WatchlistDetailPage } from "./Query";

export type GetWatchlistDetailParams = {
  watchlistId: number;
  cursor?: number;
  pageSize?: number;
  query?: string;
  unwatchedOnly?: boolean;
};

export type WatchlistItemPage = {
  items: WatchlistItem[];
  hasNextPage: boolean;
};

export async function loadWatchlistById(watchlistId: number): Promise<Watchlist | null> {
  const [watchlist] = await getDb().select().from(watchlists).where(eq(watchlists.id, watchlistId));
  return watchlist ?? null;
}

export async function loadWatchlistSummary(watchlist: Watchlist): Promise<WatchlistSummary> {
  const db = getDb();
  const [counts, selection] = await Promise.all([
    loadDetailCounts(watchlist.id),
    loadDetailSelection({ db, watchlistId: watchlist.id, itemOrderMode: watchlist.itemOrderMode }),
  ]);

  return {
    ...watchlist,
    stats: buildSummaryStats(counts, selection),
  };
}

async function loadDetailCounts(watchlistId: number) {
  const [counts] = await getDb()
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
  itemOrderMode: Watchlist["itemOrderMode"];
}): Promise<SummarySelection> {
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
  };
}

function firstItemOrNull(items: WatchlistItem[]) {
  return items[0] ?? null;
}

function selectCoverItem(
  nextUnwatched: WatchlistItem | null,
  firstItems: WatchlistItem[],
): WatchlistItem | null {
  if (nextUnwatched) {
    return nextUnwatched;
  }
  return firstItemOrNull(firstItems);
}

export function buildDetailFilters({
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

export async function loadWatchlistItemPage({
  watchlist,
  pageSize,
  offset,
  query,
  unwatchedOnly,
}: {
  watchlist: Watchlist;
  pageSize: number;
  offset: number;
  query?: string;
  unwatchedOnly?: boolean;
}): Promise<WatchlistItemPage> {
  const itemsWithContinuation = await getDb()
    .select()
    .from(watchlistItems)
    .where(buildDetailFilters({ watchlistId: watchlist.id, query, unwatchedOnly }))
    .orderBy(...buildDetailOrderBy(watchlist.itemOrderMode))
    .limit(pageSize + 1)
    .offset(offset);

  return {
    items: itemsWithContinuation.slice(0, pageSize),
    hasNextPage: itemsWithContinuation.length > pageSize,
  };
}

export async function getWatchlistDetail(
  params: GetWatchlistDetailParams,
): Promise<WatchlistDetailPage | null> {
  const { watchlistId, cursor, pageSize, query, unwatchedOnly } = normalizeDetailParams(params);
  const watchlist = await loadWatchlistById(watchlistId);

  if (!watchlist) {
    return null;
  }

  const [summary, page] = await Promise.all([
    loadWatchlistSummary(watchlist),
    loadWatchlistItemPage({
      watchlist,
      pageSize,
      offset: (cursor - 1) * pageSize,
      query,
      unwatchedOnly,
    }),
  ]);

  return {
    watchlist: summary,
    items: page.items,
    nextCursor: nextPageCursor(page.hasNextPage, cursor),
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

function nextPageCursor(hasNextPage: boolean, cursor: number) {
  return hasNextPage ? cursor + 1 : undefined;
}
