"use server";

import { escapeLikeString } from "../utils/search";
import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { watchlists, watchlistItems } from "../db/schema";
import { eq, desc, inArray, asc, sql, and, or } from "drizzle-orm";
import { z } from "zod";

const watchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const deleteWatchlistSchema = z.object({
  id: z.number(),
});

const mergeWatchlistSchema = z
  .object({
    targetWatchlistId: z.number().optional(),
    sourceWatchlistIds: z.array(z.number()),
    newWatchlistName: z.string().optional(),
  })
  .refine((data) => data.targetWatchlistId || data.newWatchlistName, {
    message: "Either targetWatchlistId or newWatchlistName must be provided",
  });

export const getWatchlists = createServerFn()
  .inputValidator((data) =>
    z
      .object({
        sortBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
      })
      .parse(data || {}),
  )
  .handler(async ({ data }) => {
    let orderBy;
    switch (data.sortBy) {
      case "lastWatched":
        orderBy = [
          sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`,
          desc(watchlists.lastWatchedAt),
        ];
        break;
      case "lastAdded":
        orderBy = [desc(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`)];
        break;
      default:
        orderBy = [desc(watchlists.createdAt)];
    }

    const lists = await db
      .select()
      .from(watchlists)
      .orderBy(...orderBy);

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
        query: z.string().optional(),
        isWatched: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { id, page, limit, query, isWatched } = data;
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
        .where(
          and(
            eq(watchlistItems.watchlistId, id),
            isWatched !== undefined ? eq(watchlistItems.isWatched, isWatched) : undefined,
            query
              ? or(
                  sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\'`,
                  sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\'`,
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

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    let targetId = data.targetWatchlistId;

    // 1. Create new watchlist if needed
    if (data.newWatchlistName && !targetId) {
      const [newList] = await db
        .insert(watchlists)
        .values({
          name: data.newWatchlistName,
          description: "Merged watchlist",
        })
        .returning();
      targetId = newList.id;
    }

    if (!targetId) {
      throw new Error("Target watchlist ID resolution failed");
    }

    // 2. Fetch items from source watchlists
    const sourceItems = await db
      .select()
      .from(watchlistItems)
      .where(inArray(watchlistItems.watchlistId, data.sourceWatchlistIds));

    if (sourceItems.length > 0) {
      // 3. Prepare items for insertion into target
      // We need to avoid duplicates.
      // Strategy:
      // - Iterate through source items.
      // - Construct a list of values to insert with targetId.
      // - Use onConflictDoUpdate to update 'isWatched' if item exists.

      const itemsToInsert = sourceItems.map((item) => ({
        watchlistId: targetId!,
        tmdbId: item.tmdbId,
        source: item.source,
        mediaType: item.mediaType,
        title: item.title,
        parentTitle: item.parentTitle,
        season: item.season,
        episode: item.episode,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate,
        voteAverage: item.voteAverage,
        runtime: item.runtime,
        // If source item is watched, merged item should be watched.
        // If target item is already watched (existing), we keep it watched.
        isWatched: item.isWatched,
        addedAt: item.addedAt,
      }));

      // Insert in chunks to be safe with SQLite limits
      const CHUNK_SIZE = 50;
      for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
        const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);

        await db
          .insert(watchlistItems)
          .values(chunk)
          .onConflictDoUpdate({
            target: [watchlistItems.watchlistId, watchlistItems.tmdbId, watchlistItems.mediaType],
            set: {
              // Update isWatched: if existing is true OR new is true -> true
              isWatched: sql`CASE WHEN ${watchlistItems.isWatched} OR excluded.is_watched THEN 1 ELSE 0 END`,
            },
          });
      }

      // Update lastItemAddedAt for target
      await db
        .update(watchlists)
        .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, targetId));
    }

    // 4. Delete source watchlists (and their items via cascade)
    // Filter out targetId if it was one of the sources (e.g. merge A+B into A)
    const sourcesToDelete = data.sourceWatchlistIds.filter((id) => id !== targetId);
    if (sourcesToDelete.length > 0) {
      await db.delete(watchlists).where(inArray(watchlists.id, sourcesToDelete));
    }

    return { success: true, targetId };
  });
