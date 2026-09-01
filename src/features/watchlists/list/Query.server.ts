import type { Watchlist as WatchlistRecord } from "@/db/Schema";
import { sql } from "drizzle-orm";
import { watchlists } from "@/db/Schema";
import { getDb } from "@/db/Db.server";
import { decodeWatchlistCursor, encodeWatchlistCursor } from "./WatchlistCursor.server";
import { buildListOrderBy } from "./WatchlistListOrder.server";
import { buildWatchlistSummaries, type WatchlistSummary } from "./WatchlistSummaryBuilder.server";

export type WatchlistListOrder = "createdAt" | "lastWatched" | "lastAdded" | "recency";
export type { WatchlistSummary } from "./WatchlistSummaryBuilder.server";
export type WatchlistSummaryPage = { watchlists: WatchlistSummary[]; nextCursor?: string };

export async function listWatchlistSummaries(
  options: { orderBy?: WatchlistListOrder; order?: "asc" | "desc" } = {},
): Promise<WatchlistSummary[]> {
  const { orderBy, order } = normalizeListOptions(options);
  const db = getDb();
  const lists = await db
    .select()
    .from(watchlists)
    .orderBy(...buildListOrderBy(orderBy, order));

  return buildWatchlistSummaries(db, lists);
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
  const db = getDb();
  const pageWithContinuation = await loadWatchlistPage(db, orderBy, order, pageSize, offset);
  const summaries = await buildWatchlistSummaries(db, pageWithContinuation.slice(0, pageSize));

  return buildWatchlistSummaryPage(
    summaries,
    pageWithContinuation,
    pageSize,
    offset,
    orderBy,
    order,
  );
}

export async function searchWatchlistSummaryPage(options: {
  query: string;
  orderBy?: WatchlistListOrder;
  order?: "asc" | "desc";
  pageSize?: number;
  cursor?: string;
}): Promise<WatchlistSummaryPage> {
  const { orderBy, order } = normalizeListOptions(options);
  const pageSize = options.pageSize ?? 50;
  const offset = getWatchlistPageOffset(options.cursor, orderBy, order);
  const db = getDb();
  const pageWithContinuation = await loadWatchlistPage(
    db,
    orderBy,
    order,
    pageSize,
    offset,
    options.query,
  );
  const summaries = await buildWatchlistSummaries(db, pageWithContinuation.slice(0, pageSize));

  return buildWatchlistSummaryPage(
    summaries,
    pageWithContinuation,
    pageSize,
    offset,
    orderBy,
    order,
  );
}

function loadWatchlistPage(
  db: ReturnType<typeof getDb>,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
  pageSize: number,
  offset: number,
  searchQuery?: string,
) {
  return db
    .select()
    .from(watchlists)
    .where(
      searchQuery === undefined
        ? undefined
        : sql`instr(lower(${watchlists.name}), lower(${searchQuery})) > 0`,
    )
    .orderBy(...buildListOrderBy(orderBy, order))
    .limit(pageSize + 1)
    .offset(offset);
}

function buildWatchlistSummaryPage(
  watchlists: WatchlistSummary[],
  pageWithContinuation: WatchlistRecord[],
  pageSize: number,
  offset: number,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
): WatchlistSummaryPage {
  const nextCursor =
    pageWithContinuation.length > pageSize
      ? encodeWatchlistCursor(offset + pageSize, orderBy, order)
      : undefined;

  return { watchlists, nextCursor };
}

function getWatchlistPageOffset(
  cursor: string | undefined,
  orderBy: WatchlistListOrder,
  order: "asc" | "desc",
) {
  return cursor === undefined ? 0 : decodeWatchlistCursor(cursor, orderBy, order);
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
