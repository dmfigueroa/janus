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

export async function discoverWatchlistItems({
  watchlistId,
  pageSize = 50,
  cursor,
  query,
}: WatchlistPageRequest): Promise<WatchlistItemDiscovery | null> {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  const offset = getPageOffset({ cursor, watchlistId, pageSize, query });
  const [summary, page, orderToken] = await Promise.all([
    loadWatchlistSummary(watchlist),
    loadWatchlistItemPage({ watchlist, pageSize, offset, query }),
    getWatchlistOrderToken(watchlist),
  ]);

  return {
    watchlist: summary,
    orderToken,
    items: page.items,
    nextCursor: nextCursorForPage({
      hasNextPage: page.hasNextPage,
      offset,
      pageSize,
      query,
      watchlistId,
    }),
  };
}

export async function findWatchlistItemsByText({
  watchlistId,
  query,
  pageSize = 50,
  cursor,
}: WatchlistPageRequest & { query: string }) {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  const offset = getPageOffset({ cursor, watchlistId, pageSize, query });
  const page = await loadWatchlistItemPage({ watchlist, pageSize, offset, query });

  return {
    items: page.items,
    nextCursor: nextCursorForPage({
      hasNextPage: page.hasNextPage,
      offset,
      pageSize,
      query,
      watchlistId,
    }),
  };
}

export async function discoverWatchlistTitles({
  watchlistId,
  pageSize = 50,
  cursor,
  query,
}: WatchlistPageRequest): Promise<WatchlistTitleDiscovery | null> {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  const offset = getPageOffset({ cursor, watchlistId, pageSize, query, resultView: "titles" });
  const [summary, titlePage] = await Promise.all([
    loadWatchlistSummary(watchlist),
    loadWatchlistTitlePage({ watchlistId, query, pageSize, offset }),
  ]);

  return { watchlist: summary, ...titlePage };
}

export async function findWatchlistTitles({
  watchlistId,
  query,
  pageSize = 50,
  cursor,
}: WatchlistPageRequest) {
  const watchlist = await loadWatchlistById(watchlistId);
  if (!watchlist) return null;

  const offset = getPageOffset({ cursor, watchlistId, pageSize, query, resultView: "titles" });
  return loadWatchlistTitlePage({ watchlistId, query, pageSize, offset });
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
