import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { getWatchlistDetail } from "./Query.server";

const watchlistPageCursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  query: z.string().optional(),
  watchlistId: z.number().int().positive(),
});

type WatchlistDetail = NonNullable<Awaited<ReturnType<typeof getWatchlistDetail>>>;
export type DiscoverWatchlistPage =
  | (Omit<WatchlistDetail, "nextCursor"> & { nextCursor?: string })
  | null;

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
    nextCursor: nextCursorForPage(page.nextCursor, offset, pageSize, query, watchlistId),
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

export async function findWatchlistItemById({
  watchlistId,
  watchlistItemId,
}: {
  watchlistId: number;
  watchlistItemId: number;
}) {
  return getDb()
    .select()
    .from(watchlistItems)
    .where(
      and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.id, watchlistItemId)),
    );
}

export async function findWatchlistItemByProvider({
  watchlistId,
  provider,
  providerId,
  mediaType,
}: {
  watchlistId: number;
  provider: string;
  providerId: string;
  mediaType: (typeof watchlistItems.$inferSelect)["mediaType"];
}) {
  return getDb()
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.source, provider),
        eq(watchlistItems.tmdbId, providerId),
        eq(watchlistItems.mediaType, mediaType),
      ),
    );
}

function encodeWatchlistPageCursor(cursor: z.infer<typeof watchlistPageCursorSchema>) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function getPageOffset({
  cursor,
  watchlistId,
  pageSize,
  query,
}: {
  cursor?: string;
  watchlistId: number;
  pageSize: number;
  query?: string;
}) {
  return cursor === undefined ? 0 : decodeWatchlistPageCursor(cursor, watchlistId, pageSize, query);
}

function nextCursorForPage(
  nextPage: number | undefined,
  offset: number,
  pageSize: number,
  query: string | undefined,
  watchlistId: number,
) {
  if (nextPage === undefined) return undefined;
  return encodeWatchlistPageCursor({ offset: offset + pageSize, pageSize, query, watchlistId });
}

function decodeWatchlistPageCursor(
  cursor: string,
  watchlistId: number,
  pageSize: number,
  query?: string,
) {
  const decoded = watchlistPageCursorSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
  );

  const cursorMatches = [
    decoded.watchlistId === watchlistId,
    decoded.pageSize === pageSize,
    decoded.query === query,
  ].every(Boolean);
  if (!cursorMatches) {
    throw new Error("Invalid watchlist item cursor.");
  }

  return decoded.offset;
}
