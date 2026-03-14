"use server";

import { createServerOnlyFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/db.server";
import { watchlistItems, watchlists } from "../../db/schema";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "../media";
import { escapeLikeString } from "../../utils/search";

export const watchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const deleteWatchlistSchema = z.object({
  id: z.number(),
});

export const mergeWatchlistSchema = z
  .object({
    targetWatchlistId: z.number().optional(),
    sourceWatchlistIds: z.array(z.number()),
    newWatchlistName: z.string().optional(),
  })
  .refine((data) => data.targetWatchlistId || data.newWatchlistName, {
    message: "Either targetWatchlistId or newWatchlistName must be provided",
  });

export const getWatchlistsInputSchema = z.object({
  sortBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const getWatchlistByIdInputSchema = z.object({
  id: z.coerce.number(),
  page: z.number().optional().default(1),
  limit: z.number().optional().default(20),
  query: z.string().optional(),
  isWatched: z.boolean().optional(),
});

export const getDeprecatedWatchlistAddRejection = (mediaType: string) => {
  if (!isDeprecatedMediaType(mediaType)) {
    return null;
  }

  return {
    kind: "rejected" as const,
    reason: "deprecated_media_type" as const,
    message: `${DEPRECATED_MEDIA_MESSAGE} New anime and manga items cannot be added to watchlists.`,
  };
};

export async function listWatchlists(input: z.infer<typeof getWatchlistsInputSchema>) {
  const { sortBy, sortOrder } = input;
  const isDesc = sortOrder === "desc";
  const orderFn = isDesc ? desc : asc;

  let orderBy;
  switch (sortBy) {
    case "lastWatched":
      orderBy = [
        isDesc
          ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
          : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
        orderFn(watchlists.lastWatchedAt),
      ];
      break;
    case "lastAdded":
      orderBy = [orderFn(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`)];
      break;
    default:
      orderBy = [orderFn(watchlists.createdAt)];
  }

  const db = getDb();
  const lists = await db
    .select()
    .from(watchlists)
    .orderBy(...orderBy);

  if (lists.length === 0) {
    return [];
  }

  const listIds = lists.map((list) => list.id);
  const items = await db
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, listIds))
    .orderBy(
      sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
      asc(watchlistItems.releaseDate),
    );

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

  return lists.map((list) => {
    const listItems = itemsByWatchlist[list.id] || [];
    const totalItems = listItems.length;
    const watchedItems = listItems.filter((item) => item.isWatched).length;
    const nextUnwatched = listItems.find((item) => !item.isWatched) || null;
    const coverItem = nextUnwatched || listItems[0] || null;

    return {
      ...list,
      stats: {
        totalItems,
        watchedItems,
        progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
        nextUnwatched,
        coverImage: coverItem?.posterPath || null,
        coverMediaType: coverItem?.mediaType || null,
      },
    };
  });
}

export const getWatchlistByIdInternal = createServerOnlyFn(
  async (input: z.infer<typeof getWatchlistByIdInputSchema>) => {
    const { id, page, limit, query, isWatched } = input;
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

    return {
      watchlist: {
        ...list,
        stats: {
          totalItems,
          watchedItems,
          progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
          nextUnwatched,
          coverImage: coverItem?.posterPath || null,
          coverMediaType: coverItem?.mediaType || null,
        },
      },
      items,
      nextCursor: items.length === limit ? page + 1 : undefined,
    };
  },
);

export type GetWatchlistByIdResult = Awaited<ReturnType<typeof getWatchlistByIdInternal>>;

export async function createWatchlistRecord(input: z.infer<typeof watchlistSchema>) {
  const db = getDb();
  const [newWatchlist] = await db
    .insert(watchlists)
    .values({
      name: input.name,
      description: input.description,
    })
    .returning();

  return newWatchlist;
}

export async function deleteWatchlistRecord(input: z.infer<typeof deleteWatchlistSchema>) {
  const db = getDb();
  await db.delete(watchlists).where(eq(watchlists.id, input.id));
  return { success: true };
}

export async function mergeWatchlistRecords(input: z.infer<typeof mergeWatchlistSchema>) {
  const db = getDb();
  let targetId = input.targetWatchlistId;

  if (input.newWatchlistName && !targetId) {
    const [newWatchlist] = await db
      .insert(watchlists)
      .values({
        name: input.newWatchlistName,
        description: "Merged watchlist",
      })
      .returning();
    targetId = newWatchlist.id;
  }

  if (!targetId) {
    throw new Error("Target watchlist ID resolution failed");
  }

  const sourceItems = await db
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, input.sourceWatchlistIds));

  if (sourceItems.length > 0) {
    const itemsToInsert = sourceItems.map((item) => ({
      watchlistId: targetId,
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
      isWatched: item.isWatched,
      addedAt: item.addedAt,
    }));

    const chunkSize = 50;
    for (let index = 0; index < itemsToInsert.length; index += chunkSize) {
      const chunk = itemsToInsert.slice(index, index + chunkSize);

      await db
        .insert(watchlistItems)
        .values(chunk)
        .onConflictDoUpdate({
          target: [watchlistItems.watchlistId, watchlistItems.tmdbId, watchlistItems.mediaType],
          set: {
            isWatched: sql`CASE WHEN ${watchlistItems.isWatched} OR excluded.is_watched THEN 1 ELSE 0 END`,
          },
        });
    }

    await db
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, targetId));
  }

  const sourcesToDelete = input.sourceWatchlistIds.filter((id) => id !== targetId);
  if (sourcesToDelete.length > 0) {
    await db.delete(watchlists).where(inArray(watchlists.id, sourcesToDelete));
  }

  return { success: true, targetId };
}

export async function setWatchlistItemWatchedState(input: { itemId: number; isWatched: boolean }) {
  const db = getDb();
  const [item] = await db
    .select({ watchlistId: watchlistItems.watchlistId })
    .from(watchlistItems)
    .where(eq(watchlistItems.id, input.itemId));

  if (!item) {
    return null;
  }

  await db
    .update(watchlistItems)
    .set({ isWatched: input.isWatched })
    .where(eq(watchlistItems.id, input.itemId));

  if (input.isWatched) {
    await db
      .update(watchlists)
      .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, item.watchlistId));
  }

  return {
    itemId: input.itemId,
    isWatched: input.isWatched,
  };
}
