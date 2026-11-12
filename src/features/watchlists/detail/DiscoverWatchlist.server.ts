import { and, asc, count, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems, type WatchlistItem } from "@/db/Schema";
import type { WatchlistSummary } from "@/features/watchlists/list/Query";
import { getWatchlistOrderToken } from "@/features/watchlists/order/SetWatchlistOrder.server";
import {
  buildDetailFilters,
  loadWatchlistById,
  loadWatchlistItemPage,
  loadWatchlistSummary,
} from "./Query.server";
import { getPageOffset, nextCursorForPage } from "./WatchlistPageCursor.server";
import { collapseWatchlistItemsToTitles, type WatchlistTitle } from "./WatchlistTitles";

export type { WatchlistTitle } from "./WatchlistTitles";

export type WatchlistItemDiscovery = {
  watchlist: WatchlistSummary;
  orderToken: string;
  items: WatchlistItem[];
  nextCursor?: string;
};

export type WatchlistTitleDiscovery = {
  watchlist: WatchlistSummary;
  titles: WatchlistTitle[];
  nextCursor?: string;
};

type WatchlistPageRequest = {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
  query?: string;
};

export type WatchlistItemSelection = {
  watchlistId: number;
} & (
  | { watchlistItemId: number }
  | {
      provider: string;
      providerId: string;
      mediaType: WatchlistItem["mediaType"];
    }
);

export async function discoverWatchlistItems(
  request: WatchlistPageRequest,
): Promise<WatchlistItemDiscovery | null> {
  const loaded = await loadWatchlistItemRequest(request);
  if (!loaded) return null;

  const [summary, orderToken] = await Promise.all([
    loadWatchlistSummary(loaded.watchlist),
    getWatchlistOrderToken(loaded.watchlist),
  ]);

  return {
    watchlist: summary,
    orderToken,
    items: loaded.page.items,
    nextCursor: loaded.nextCursor,
  };
}

export async function findWatchlistItemsByText(request: WatchlistPageRequest & { query: string }) {
  const loaded = await loadWatchlistItemRequest(request);
  if (!loaded) return null;

  return { items: loaded.page.items, nextCursor: loaded.nextCursor };
}

async function loadWatchlistItemRequest({
  watchlistId,
  pageSize = 50,
  cursor,
  query,
}: WatchlistPageRequest) {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  const offset = getPageOffset({ cursor, watchlistId, pageSize, query });
  const page = await loadWatchlistItemPage({ watchlist, pageSize, offset, query });

  return {
    watchlist,
    page,
    nextCursor: nextCursorForPage({
      hasNextPage: page.hasNextPage,
      offset,
      pageSize,
      query,
      watchlistId,
    }),
  };
}

export async function discoverWatchlistTitles(
  request: WatchlistPageRequest,
): Promise<WatchlistTitleDiscovery | null> {
  const loaded = await loadWatchlistTitleRequest(request);
  if (!loaded) return null;

  const [summary, titlePage] = await Promise.all([
    loadWatchlistSummary(loaded.watchlist),
    loadWatchlistTitlePage(loaded),
  ]);

  return { watchlist: summary, ...titlePage };
}

export async function findWatchlistTitles(request: WatchlistPageRequest) {
  const loaded = await loadWatchlistTitleRequest(request);
  if (!loaded) return null;

  return loadWatchlistTitlePage(loaded);
}

async function loadWatchlistTitleRequest({
  watchlistId,
  pageSize = 50,
  cursor,
  query,
}: WatchlistPageRequest) {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  return {
    watchlist,
    watchlistId,
    pageSize,
    query,
    offset: getPageOffset({ cursor, watchlistId, pageSize, query, resultView: "titles" }),
  };
}

export async function findWatchlistItemMatches(
  selection: WatchlistItemSelection,
): Promise<WatchlistItem[]> {
  const db = getDb();

  if ("watchlistItemId" in selection) {
    return db
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.watchlistId, selection.watchlistId),
          eq(watchlistItems.id, selection.watchlistItemId),
        ),
      );
  }

  return db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, selection.watchlistId),
        eq(watchlistItems.source, selection.provider),
        or(
          eq(watchlistItems.tmdbId, selection.providerId),
          eq(watchlistItems.parentId, selection.providerId),
        ),
        eq(watchlistItems.mediaType, selection.mediaType),
      ),
    );
}

export async function findWatchlistTitleMatches(
  selection: WatchlistItemSelection,
): Promise<WatchlistTitle[]> {
  return collapseWatchlistItemsToTitles(await findWatchlistItemMatches(selection));
}

async function loadWatchlistTitlePage({
  watchlistId,
  query,
  pageSize,
  offset,
}: {
  watchlistId: number;
  query?: string;
  pageSize: number;
  offset: number;
}) {
  const providerId = sql<string>`coalesce(${watchlistItems.parentId}, ${watchlistItems.tmdbId})`;
  const title = sql<string>`coalesce(${watchlistItems.parentTitle}, ${watchlistItems.title})`;
  const titlesWithContinuation = await getDb()
    .select({
      provider: watchlistItems.source,
      providerId,
      mediaType: watchlistItems.mediaType,
      title,
      matchingItemCount: count(),
    })
    .from(watchlistItems)
    .where(buildDetailFilters({ watchlistId, query }))
    .groupBy(watchlistItems.source, providerId, watchlistItems.mediaType, title)
    .orderBy(asc(title), asc(providerId))
    .limit(pageSize + 1)
    .offset(offset);

  return {
    titles: titlesWithContinuation.slice(0, pageSize) as WatchlistTitle[],
    nextCursor: nextCursorForPage({
      hasNextPage: titlesWithContinuation.length > pageSize,
      offset,
      pageSize,
      query,
      watchlistId,
      resultView: "titles",
    }),
  };
}
