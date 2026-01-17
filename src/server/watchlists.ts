"use server";

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { watchlists, watchlistItems } from "../db/schema";
import { eq, desc, inArray, asc, sql, and } from "drizzle-orm";
import { z } from "zod";

const watchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const deleteWatchlistSchema = z.object({
  id: z.number(),
});

export const getWatchlists = createServerFn().handler(async () => {
  const lists = await db.select().from(watchlists).orderBy(desc(watchlists.createdAt));

  if (lists.length === 0) {
    return [];
  }

  const listIds = lists.map((l) => l.id);

  const items = await db
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, listIds))
    .orderBy(
      sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
      asc(watchlistItems.releaseDate),
    );

  // Group items by watchlistId
  const itemsByWatchlist = items.reduce(
    (acc, item) => {
      if (!acc[item.watchlistId]) {
        acc[item.watchlistId] = [];
      }
      acc[item.watchlistId].push(item);
      return acc;
    },
    {} as Record<number, typeof items>,
  );

  // Enrich watchlists with stats
  return lists.map((list) => {
    const listItems = itemsByWatchlist[list.id] || [];
    const totalItems = listItems.length;
    const watchedItems = listItems.filter((i) => i.isWatched).length;

    // Find next unwatched item (sorted by release date)
    const nextUnwatched = listItems.find((i) => !i.isWatched) || null;

    const coverItem = nextUnwatched || listItems[0] || null;
    const coverImage = coverItem?.posterPath || null;
    const coverMediaType = coverItem?.mediaType || null;

    return {
      ...list,
      stats: {
        totalItems,
        watchedItems,
        progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
        nextUnwatched,
        coverImage,
        coverMediaType,
      },
    };
  });
});

export const getWatchlistById = createServerFn()
  .inputValidator((data) =>
    z
      .object({
        id: z.coerce.number(),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { id, page, limit } = data;
    const offset = (page - 1) * limit;

    const [list] = await db.select().from(watchlists).where(eq(watchlists.id, id));

    if (!list) {
      throw new Error("Watchlist not found");
    }

    // Parallelize stats queries
    const [totalRes, watchedRes, nextUnwatchedRes, firstItemRes, items] = await Promise.all([
      // Total Items
      db
        .select({ count: sql<number>`count(*)` })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id)),

      // Watched Items
      db
        .select({ count: sql<number>`count(*)` })
        .from(watchlistItems)
        .where(and(eq(watchlistItems.watchlistId, id), eq(watchlistItems.isWatched, true))),

      // Next Unwatched (for cover & stats)
      db
        .select()
        .from(watchlistItems)
        .where(and(eq(watchlistItems.watchlistId, id), eq(watchlistItems.isWatched, false)))
        .orderBy(
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
        )
        .limit(1),

      // First Item (fallback for cover if all watched)
      db
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id))
        .orderBy(
          sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
          asc(watchlistItems.releaseDate),
        )
        .limit(1),

      // Paginated Items
      db
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id))
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
  });

export const createWatchlist = createServerFn()
  .inputValidator((data) => watchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const [newItem] = await db
      .insert(watchlists)
      .values({
        name: data.name,
        description: data.description,
      })
      .returning();
    return newItem;
  });

export const deleteWatchlist = createServerFn()
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    await db.delete(watchlists).where(eq(watchlists.id, data.id));
    return { success: true };
  });
