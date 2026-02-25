import { createServerOnlyFn } from "@tanstack/react-start";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { watchlists, watchlistItems } from "@/db/schema";
import { getDb } from "@/db/server.server";
import { escapeLikeString } from "@/utils/search";

export const queryWatchlistDetailsById = createServerOnlyFn(
  async (data: {
    id: number;
    page: number;
    limit: number;
    query?: string;
    isWatched?: boolean;
  }) => {
    const { id, page, limit, query, isWatched } = data;
    const offset = (page - 1) * limit;

    const db = getDb();
    const [list] = await db.select().from(watchlists).where(eq(watchlists.id, id));

    if (!list) {
      throw new Error("Watchlist not found");
    }

    const [totalRes, watchedRes, nextUnwatchedRes, firstItemRes, items] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id)),

      db
        .select({ count: sql<number>`count(*)` })
        .from(watchlistItems)
        .where(and(eq(watchlistItems.watchlistId, id), eq(watchlistItems.isWatched, true))),

      db
        .select()
        .from(watchlistItems)
        .where(and(eq(watchlistItems.watchlistId, id), eq(watchlistItems.isWatched, false)))
        .orderBy(
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
        )
        .limit(1),

      db
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id))
        .orderBy(
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
        )
        .limit(1),

      db
        .select()
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.watchlistId, id),
            isWatched !== undefined ? eq(watchlistItems.isWatched, isWatched) : undefined,
            query
              ? or(
                  sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
                  sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
                  sql`${watchlistItems.episode} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
                )
              : undefined,
          ),
        )
        .orderBy(
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
        )
        .limit(limit)
        .offset(offset),
    ]);

    const totalItems = totalRes[0]?.count || 0;
    const watchedItems = watchedRes[0]?.count || 0;
    const nextUnwatched = nextUnwatchedRes[0] || null;
    const firstItem = firstItemRes[0] || null;

    const coverItem = nextUnwatched || firstItem || null;
    const coverImage = coverItem?.posterPath || null;
    const coverMediaType = coverItem?.mediaType || null;

    return {
      watchlist: {
        ...list,
        stats: {
          totalItems,
          watchedItems,
          progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
          nextUnwatched,
          coverImage,
          coverMediaType,
        },
      },
      items,
      nextCursor: items.length === limit ? page + 1 : undefined,
    };
  },
);

export type WatchlistDetailsQueryResult = Awaited<ReturnType<typeof queryWatchlistDetailsById>>;
