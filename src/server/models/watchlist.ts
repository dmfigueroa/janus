"use server";

import { createServerOnlyFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/db.server";
import { watchlistItems, watchlists, type Watchlist, type WatchlistItem } from "../../db/schema";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "../media";
import { escapeLikeString } from "../../utils/search";

type WatchlistStats = {
  totalItems: number;
  watchedItems: number;
  progress: number;
  nextUnwatched: WatchlistItem | null;
  coverImage: string | null;
  coverMediaType: WatchlistItem["mediaType"] | null;
};

type WatchlistSummary = Watchlist & {
  stats: WatchlistStats;
};

type WatchlistItemFilters = {
  watchlistId: number;
  query?: string;
  isWatched?: boolean;
};

type MergeWatchlistInput = z.infer<typeof mergeWatchlistSchema>;
type ToggleWatchedInput = { itemId: number; isWatched: boolean };

const WATCHLIST_ITEM_INSERT_CHUNK_SIZE = 50;

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

export class WatchlistNotFoundError extends Error {
  constructor(readonly watchlistId: number) {
    super(`Watchlist ${watchlistId} not found`);
    this.name = "WatchlistNotFoundError";
  }
}

function getWatchlistSortOrder(input: z.infer<typeof getWatchlistsInputSchema>) {
  const isDesc = input.sortOrder === "desc";
  const orderFn = isDesc ? desc : asc;

  switch (input.sortBy) {
    case "lastWatched":
      return [
        isDesc
          ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
          : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
        orderFn(watchlists.lastWatchedAt),
      ] as const;
    case "lastAdded":
      return [
        orderFn(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`),
      ] as const;
    default:
      return [orderFn(watchlists.createdAt)] as const;
  }
}

function orderWatchlistItemsByReleaseDate() {
  return [
    sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
    asc(watchlistItems.releaseDate),
  ] as const;
}

function groupItemsByWatchlist(items: WatchlistItem[]) {
  return items.reduce<Record<number, WatchlistItem[]>>((acc, item) => {
    if (!acc[item.watchlistId]) {
      acc[item.watchlistId] = [];
    }

    acc[item.watchlistId].push(item);
    return acc;
  }, {});
}

function buildWatchlistStats(input: {
  items: WatchlistItem[];
  totalItems?: number;
  watchedItems?: number;
  nextUnwatched?: WatchlistItem | null;
  firstItem?: WatchlistItem | null;
}): WatchlistStats {
  const totalItems = input.totalItems ?? input.items.length;
  const watchedItems = input.watchedItems ?? input.items.filter((item) => item.isWatched).length;
  const nextUnwatched = input.nextUnwatched ?? input.items.find((item) => !item.isWatched) ?? null;
  const firstItem = input.firstItem ?? input.items[0] ?? null;
  const coverItem = nextUnwatched ?? firstItem;

  return {
    totalItems,
    watchedItems,
    progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
    nextUnwatched,
    coverImage: coverItem?.posterPath ?? null,
    coverMediaType: coverItem?.mediaType ?? null,
  };
}

function buildWatchlistSummary(watchlist: Watchlist, stats: WatchlistStats): WatchlistSummary {
  return {
    ...watchlist,
    stats,
  };
}

/**
 * Returns the watchlist for the given id.
 * Throws `WatchlistNotFoundError` when no watchlist exists.
 */
async function getWatchlist(id: number) {
  const db = getDb();
  const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, id));

  if (!watchlist) {
    throw new WatchlistNotFoundError(id);
  }

  return watchlist;
}

async function resolveMergeTargetWatchlist(input: MergeWatchlistInput) {
  if (input.targetWatchlistId) {
    return input.targetWatchlistId;
  }

  if (!input.newWatchlistName) {
    throw new Error("Target watchlist ID resolution failed");
  }

  const db = getDb();
  const [watchlist] = await db
    .insert(watchlists)
    .values({
      name: input.newWatchlistName,
      description: "Merged watchlist",
    })
    .returning();

  return watchlist.id;
}

function getWatchlistItemSearchFilter({ watchlistId, query, isWatched }: WatchlistItemFilters) {
  return and(
    eq(watchlistItems.watchlistId, watchlistId),
    isWatched !== undefined ? eq(watchlistItems.isWatched, isWatched) : undefined,
    query
      ? or(
          sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.episode} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
        )
      : undefined,
  );
}

function toMergedWatchlistItem(targetWatchlistId: number, item: WatchlistItem) {
  return {
    watchlistId: targetWatchlistId,
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
  };
}

async function copyItemsToWatchlist(targetWatchlistId: number, sourceWatchlistIds: number[]) {
  const db = getDb();
  const sourceItems = await db
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds));

  if (sourceItems.length === 0) {
    return;
  }

  const itemsToInsert = sourceItems.map((item) => toMergedWatchlistItem(targetWatchlistId, item));

  for (let index = 0; index < itemsToInsert.length; index += WATCHLIST_ITEM_INSERT_CHUNK_SIZE) {
    const chunk = itemsToInsert.slice(index, index + WATCHLIST_ITEM_INSERT_CHUNK_SIZE);

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
    .where(eq(watchlists.id, targetWatchlistId));
}

async function deleteMergedSourceWatchlists(
  targetWatchlistId: number,
  sourceWatchlistIds: number[],
) {
  const sourceIdsToDelete = sourceWatchlistIds.filter((id) => id !== targetWatchlistId);

  if (sourceIdsToDelete.length === 0) {
    return;
  }

  const db = getDb();
  await db.delete(watchlists).where(inArray(watchlists.id, sourceIdsToDelete));
}

async function getWatchlistItemTarget(itemId: number) {
  const db = getDb();
  const [item] = await db
    .select({ watchlistId: watchlistItems.watchlistId })
    .from(watchlistItems)
    .where(eq(watchlistItems.id, itemId));

  return item ?? null;
}

async function markWatchlistItemWatchedState(input: ToggleWatchedInput) {
  const db = getDb();

  await db
    .update(watchlistItems)
    .set({ isWatched: input.isWatched })
    .where(eq(watchlistItems.id, input.itemId));
}

async function updateWatchlistLastWatchedAt(watchlistId: number) {
  const db = getDb();

  await db
    .update(watchlists)
    .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

export async function listWatchlists(input: z.infer<typeof getWatchlistsInputSchema>) {
  const db = getDb();
  const lists = await db
    .select()
    .from(watchlists)
    .orderBy(...getWatchlistSortOrder(input));

  if (lists.length === 0) {
    return [];
  }

  const listIds = lists.map((list) => list.id);
  const items = await db
    .select()
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, listIds))
    .orderBy(...orderWatchlistItemsByReleaseDate());

  const itemsByWatchlist = groupItemsByWatchlist(items);

  return lists.map((list) => {
    const stats = buildWatchlistStats({ items: itemsByWatchlist[list.id] ?? [] });
    return buildWatchlistSummary(list, stats);
  });
}

export const getWatchlistByIdInternal = createServerOnlyFn(
  async (input: z.infer<typeof getWatchlistByIdInputSchema>) => {
    const { id, page, limit, query, isWatched } = input;
    const offset = (page - 1) * limit;

    const db = getDb();
    const watchlist = await getWatchlist(id);

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
        .orderBy(...orderWatchlistItemsByReleaseDate())
        .limit(1),
      db
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id))
        .orderBy(...orderWatchlistItemsByReleaseDate())
        .limit(1),
      db
        .select()
        .from(watchlistItems)
        .where(getWatchlistItemSearchFilter({ watchlistId: id, query, isWatched }))
        .orderBy(...orderWatchlistItemsByReleaseDate())
        .limit(limit)
        .offset(offset),
    ]);

    const stats = buildWatchlistStats({
      items,
      totalItems: totalRes[0]?.count ?? 0,
      watchedItems: watchedRes[0]?.count ?? 0,
      nextUnwatched: nextUnwatchedRes[0] ?? null,
      firstItem: firstItemRes[0] ?? null,
    });

    return {
      watchlist: buildWatchlistSummary(watchlist, stats),
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
  const targetId = await resolveMergeTargetWatchlist(input);

  await copyItemsToWatchlist(targetId, input.sourceWatchlistIds);
  await deleteMergedSourceWatchlists(targetId, input.sourceWatchlistIds);

  return { success: true, targetId };
}

export async function setWatchlistItemWatchedState(input: ToggleWatchedInput) {
  const item = await getWatchlistItemTarget(input.itemId);

  if (!item) {
    return null;
  }

  await markWatchlistItemWatchedState(input);

  if (input.isWatched) {
    await updateWatchlistLastWatchedAt(item.watchlistId);
  }

  return {
    itemId: input.itemId,
    isWatched: input.isWatched,
  };
}
