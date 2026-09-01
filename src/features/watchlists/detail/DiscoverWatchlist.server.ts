import { z } from "zod";
import { asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlists, watchlistItems } from "@/db/Schema";
import { buildDetailFilters, getWatchlistDetail } from "./Query.server";

const watchlistPageCursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  query: z.string().optional(),
  resultView: z.enum(["items", "titles"]).optional(),
  watchlistId: z.number().int().positive(),
});

type WatchlistDetail = NonNullable<Awaited<ReturnType<typeof getWatchlistDetail>>>;
export type DiscoverWatchlistPage =
  | (Omit<WatchlistDetail, "nextCursor"> & { nextCursor?: string })
  | null;

export type WatchlistTitle = {
  provider: string;
  providerId: string;
  mediaType: (typeof watchlistItems.$inferSelect)["mediaType"];
  title: string;
  matchingItemCount: number;
};

export async function discoverWatchlistPage({
  watchlistId,
  pageSize = 50,
  cursor,
  query,
}: {
  watchlistId: number;
  pageSize?: number;
  cursor?: string;
  query?: string;
}): Promise<DiscoverWatchlistPage> {
  const offset = getPageOffset({ cursor, watchlistId, pageSize, query });
  const page = await getWatchlistDetail({
    watchlistId,
    pageSize,
    cursor: offset / pageSize + 1,
    query,
  });

  if (!page) {
    return null;
  }

  return {
    ...page,
    nextCursor: nextCursorForPage(
      page.nextCursor !== undefined,
      offset,
      pageSize,
      query,
      watchlistId,
    ),
  };
}

export async function findWatchlistItemsByText({
  watchlistId,
  query,
  pageSize,
  cursor,
}: {
  watchlistId: number;
  query: string;
  pageSize?: number;
  cursor?: string;
}) {
  return discoverWatchlistPage({ watchlistId, query, pageSize, cursor });
}

export async function findWatchlistTitles({
  watchlistId,
  query,
  pageSize = 50,
  cursor,
}: {
  watchlistId: number;
  query?: string;
  pageSize?: number;
  cursor?: string;
}) {
  const offset = getPageOffset({ cursor, watchlistId, pageSize, query, resultView: "titles" });
  return loadWatchlistTitlePage({ watchlistId, query, pageSize, offset });
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
  const db = getDb();
  const [watchlist] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId));
  if (!watchlist) return null;

  const providerId = sql<string>`coalesce(${watchlistItems.parentId}, ${watchlistItems.tmdbId})`;
  const title = sql<string>`coalesce(${watchlistItems.parentTitle}, ${watchlistItems.title})`;
  const titlesWithContinuation = await db
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
  const titles = titlesWithContinuation.slice(0, pageSize) as WatchlistTitle[];

  return {
    titles,
    nextCursor: nextCursorForPage(
      titlesWithContinuation.length > pageSize,
      offset,
      pageSize,
      query,
      watchlistId,
      "titles",
    ),
  };
}

function encodeWatchlistPageCursor(cursor: z.infer<typeof watchlistPageCursorSchema>) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function getPageOffset({
  cursor,
  watchlistId,
  pageSize,
  query,
  resultView,
}: {
  cursor?: string;
  watchlistId: number;
  pageSize: number;
  query?: string;
  resultView?: "items" | "titles";
}) {
  return cursor === undefined
    ? 0
    : decodeWatchlistPageCursor(cursor, watchlistId, pageSize, query, resultView);
}

function nextCursorForPage(
  hasNextPage: boolean,
  offset: number,
  pageSize: number,
  query: string | undefined,
  watchlistId: number,
  resultView?: "items" | "titles",
) {
  if (!hasNextPage) return undefined;
  return encodeWatchlistPageCursor({
    offset: offset + pageSize,
    pageSize,
    query,
    resultView,
    watchlistId,
  });
}

function decodeWatchlistPageCursor(
  cursor: string,
  watchlistId: number,
  pageSize: number,
  query?: string,
  resultView?: "items" | "titles",
) {
  const decoded = watchlistPageCursorSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
  );

  const cursorMatches = [
    decoded.watchlistId === watchlistId,
    decoded.pageSize === pageSize,
    decoded.query === query,
    decoded.resultView === resultView,
  ].every(Boolean);
  if (!cursorMatches) {
    throw new Error("Invalid watchlist item cursor.");
  }

  return decoded.offset;
}
