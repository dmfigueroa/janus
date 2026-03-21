"use server";

import type { Watchlist as WatchlistRecord, WatchlistItem } from "../db/schema";
import { watchlists, watchlistItems } from "../db/schema";
import { getDb } from "../db/db.server";
import { escapeLikeString } from "../utils/search";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

export type WatchlistListOrder = "createdAt" | "lastWatched" | "lastAdded";

export type WatchlistStats = {
  totalItems: number;
  watchedItems: number;
  progress: number;
  nextUnwatched: WatchlistItem | null;
  coverImage: string | null;
  coverMediaType: WatchlistItem["mediaType"] | null;
};

export type WatchlistSummary = WatchlistRecord & {
  stats: WatchlistStats;
};

export type WatchlistDetailPage = {
  watchlist: WatchlistSummary;
  items: WatchlistItem[];
  nextCursor?: number;
};

const releaseDateOrder = [
  sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
  asc(watchlistItems.releaseDate),
] as const;

function buildWatchlistStats(items: WatchlistItem[]): WatchlistStats {
  const totalItems = items.length;
  const watchedItems = items.filter((item) => item.isWatched).length;
  const nextUnwatched = items.find((item) => !item.isWatched) ?? null;
  const coverItem = nextUnwatched ?? items[0] ?? null;

  return {
    totalItems,
    watchedItems,
    progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
    nextUnwatched,
    coverImage: coverItem?.posterPath ?? null,
    coverMediaType: coverItem?.mediaType ?? null,
  };
}

function buildListOrderBy(orderBy: WatchlistListOrder, order: "asc" | "desc") {
  const orderFn = order === "desc" ? desc : asc;

  switch (orderBy) {
    case "lastWatched":
      return [
        order === "desc"
          ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
          : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
        orderFn(watchlists.lastWatchedAt),
      ] as const;
    case "lastAdded":
      return [
        orderFn(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`),
      ] as const;
    case "createdAt":
    default:
      return [orderFn(watchlists.createdAt)] as const;
  }
}

function buildDetailFilters({
  watchlistId,
  query,
  unwatchedOnly,
}: {
  watchlistId: number;
  query?: string;
  unwatchedOnly?: boolean;
}) {
  return and(
    eq(watchlistItems.watchlistId, watchlistId),
    unwatchedOnly ? eq(watchlistItems.isWatched, false) : undefined,
    query
      ? or(
          sql`${watchlistItems.title} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.parentTitle} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
          sql`${watchlistItems.episode} LIKE ${`%${escapeLikeString(query)}%`} ESCAPE '\\' COLLATE NOCASE`,
        )
      : undefined,
  );
}

export const Watchlist = {
  async listSummaries({
    orderBy = "createdAt",
    order = "desc",
  }: {
    orderBy?: WatchlistListOrder;
    order?: "asc" | "desc";
  } = {}): Promise<WatchlistSummary[]> {
    const db = getDb();
    const lists = await db
      .select()
      .from(watchlists)
      .orderBy(...buildListOrderBy(orderBy, order));

    if (lists.length === 0) {
      return [];
    }

    const listIds = lists.map((watchlist) => watchlist.id);
    const items = await db
      .select()
      .from(watchlistItems)
      .where(inArray(watchlistItems.watchlistId, listIds))
      .orderBy(...releaseDateOrder);

    const itemsByWatchlist = items.reduce<Record<number, WatchlistItem[]>>((acc, item) => {
      acc[item.watchlistId] ??= [];
      acc[item.watchlistId].push(item);
      return acc;
    }, {});

    return lists.map((watchlist) => ({
      ...watchlist,
      stats: buildWatchlistStats(itemsByWatchlist[watchlist.id] ?? []),
    }));
  },

  async getDetail({
    watchlistId,
    cursor = 1,
    pageSize = 50,
    query,
    unwatchedOnly,
  }: {
    watchlistId: number;
    cursor?: number;
    pageSize?: number;
    query?: string;
    unwatchedOnly?: boolean;
  }): Promise<WatchlistDetailPage | null> {
    const db = getDb();
    const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, watchlistId));

    if (!watchlist) {
      return null;
    }

    const offset = (cursor - 1) * pageSize;
    const [totalResult, watchedResult, nextUnwatchedResult, firstItemResult, items] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, watchlistId)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(watchlistItems)
          .where(
            and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.isWatched, true)),
          ),
        db
          .select()
          .from(watchlistItems)
          .where(
            and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.isWatched, false)),
          )
          .orderBy(...releaseDateOrder)
          .limit(1),
        db
          .select()
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, watchlistId))
          .orderBy(...releaseDateOrder)
          .limit(1),
        db
          .select()
          .from(watchlistItems)
          .where(buildDetailFilters({ watchlistId, query, unwatchedOnly }))
          .orderBy(...releaseDateOrder)
          .limit(pageSize)
          .offset(offset),
      ]);

    const totalItems = totalResult[0]?.count ?? 0;
    const watchedItems = watchedResult[0]?.count ?? 0;
    const nextUnwatched = nextUnwatchedResult[0] ?? null;
    const coverItem = nextUnwatched ?? firstItemResult[0] ?? null;

    return {
      watchlist: {
        ...watchlist,
        stats: {
          totalItems,
          watchedItems,
          progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
          nextUnwatched,
          coverImage: coverItem?.posterPath ?? null,
          coverMediaType: coverItem?.mediaType ?? null,
        },
      },
      items,
      nextCursor: items.length === pageSize ? cursor + 1 : undefined,
    };
  },

  async create({
    name,
    description,
  }: {
    name: string;
    description?: string;
  }): Promise<WatchlistRecord> {
    const db = getDb();
    const [watchlist] = await db
      .insert(watchlists)
      .values({
        name,
        description,
      })
      .returning();

    return watchlist;
  },

  async destroy(id: number): Promise<void> {
    const db = getDb();
    await db.delete(watchlists).where(eq(watchlists.id, id));
  },

  async merge({
    targetWatchlistId,
    sourceWatchlistIds,
    newWatchlistName,
  }: {
    targetWatchlistId?: number;
    sourceWatchlistIds: number[];
    newWatchlistName?: string;
  }): Promise<{ targetId: number }> {
    const db = getDb();
    let targetId = targetWatchlistId;

    if (newWatchlistName && !targetId) {
      const [newWatchlist] = await db
        .insert(watchlists)
        .values({
          name: newWatchlistName,
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
      .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds));

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
      for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
        const chunk = itemsToInsert.slice(i, i + chunkSize);

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

    const sourcesToDelete = sourceWatchlistIds.filter((id) => id !== targetId);
    if (sourcesToDelete.length > 0) {
      await db.delete(watchlists).where(inArray(watchlists.id, sourcesToDelete));
    }

    return { targetId };
  },
};
