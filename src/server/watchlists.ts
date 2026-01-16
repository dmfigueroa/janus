"use server";

import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { watchlists } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const watchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const deleteWatchlistSchema = z.object({
  id: z.number(),
});

import { watchlistItems } from "../db/schema";
import { inArray, asc } from "drizzle-orm";

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
    .orderBy(asc(watchlistItems.releaseDate));

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

    // Fallback cover: use the first item's poster if all are watched, or null if empty
    const coverImage = nextUnwatched?.posterPath || listItems[0]?.posterPath || null;

    return {
      ...list,
      stats: {
        totalItems,
        watchedItems,
        progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
        nextUnwatched,
        coverImage,
      },
    };
  });
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
