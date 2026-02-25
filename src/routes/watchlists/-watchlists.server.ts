"use server";

import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { watchlists, watchlistItems } from "@/db/schema";
import { eq, desc, inArray, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { runServerHandler } from "@/routes/_shared/-effect";

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

type SortBy = "createdAt" | "lastWatched" | "lastAdded";
type SortOrder = "asc" | "desc";

function buildOrderBy(sortBy: SortBy, sortOrder: SortOrder) {
  const isDesc = sortOrder === "desc";
  const orderFn = isDesc ? desc : asc;

  switch (sortBy) {
    case "lastWatched":
      return [
        isDesc
          ? sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 1 ELSE 0 END`
          : sql`CASE WHEN ${watchlists.lastWatchedAt} IS NULL THEN 0 ELSE 1 END`,
        orderFn(watchlists.lastWatchedAt),
      ];
    case "lastAdded":
      return [orderFn(sql`COALESCE(${watchlists.lastItemAddedAt}, ${watchlists.createdAt})`)];
    default:
      return [orderFn(watchlists.createdAt)];
  }
}

function getDbEffect() {
  return Effect.tryPromise({
    try: async () => {
      const { getDb: resolveDb } = await import("@/db/server.server");
      return resolveDb();
    },
    catch: (error) => new Error(`Failed to get database: ${String(error)}`),
  });
}

function getWatchlistsProgram(
  sortBy: SortBy,
  sortOrder: SortOrder,
): Effect.Effect<
  Array<
    {
      stats: {
        totalItems: number;
        watchedItems: number;
        progress: number;
        nextUnwatched: typeof watchlistItems.$inferSelect | null;
        coverImage: string | null;
        coverMediaType: (typeof watchlistItems.$inferSelect)["mediaType"] | null;
      };
    } & typeof watchlists.$inferSelect
  >,
  Error
> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();
    const orderBy = buildOrderBy(sortBy, sortOrder);

    const lists = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlists)
          .orderBy(...orderBy),
      catch: (error) => new Error(`Failed to fetch watchlists: ${String(error)}`),
    });

    if (lists.length === 0) {
      return [];
    }

    const listIds = lists.map((l) => l.id);

    const items = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(inArray(watchlistItems.watchlistId, listIds))
          .orderBy(
            sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
            asc(watchlistItems.releaseDate),
          ),
      catch: (error) => new Error(`Failed to fetch watchlist items: ${String(error)}`),
    });

    const itemsByWatchlist = items.reduce<Record<number, typeof items>>((acc, item) => {
      if (!acc[item.watchlistId]) {
        acc[item.watchlistId] = [];
      }
      acc[item.watchlistId].push(item);
      return acc;
    }, {});

    return lists.map((list) => {
      const listItems = itemsByWatchlist[list.id] || [];
      const totalItems = listItems.length;
      const watchedItems = listItems.filter((i) => i.isWatched).length;
      const nextUnwatched = listItems.find((i) => !i.isWatched) || null;
      const coverItem = nextUnwatched || listItems[0] || null;

      return {
        ...list,
        stats: {
          totalItems,
          watchedItems,
          progress: totalItems > 0 ? Math.round((watchedItems / totalItems) * 100) : 0,
          nextUnwatched,
          coverImage: coverItem?.posterPath ?? null,
          coverMediaType: coverItem?.mediaType ?? null,
        },
      };
    });
  });
}

function createWatchlistProgram(
  data: z.infer<typeof watchlistSchema>,
): Effect.Effect<typeof watchlists.$inferSelect, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();

    const values: { name: string; description: string | null } = {
      name: data.name,
      description: data.description ?? null,
    };

    const [newItem] = yield* Effect.tryPromise({
      try: () => db.insert(watchlists).values(values).returning(),
      catch: (error) => new Error(`Failed to create watchlist: ${String(error)}`),
    });

    return newItem;
  });
}

function deleteWatchlistProgram(id: number): Effect.Effect<{ success: true }, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();

    yield* Effect.tryPromise({
      try: () => db.delete(watchlists).where(eq(watchlists.id, id)),
      catch: (error) => new Error(`Failed to delete watchlist: ${String(error)}`),
    });

    return { success: true };
  });
}

function mergeWatchlistsProgram(
  data: z.infer<typeof mergeWatchlistSchema>,
): Effect.Effect<{ success: true; targetId: number }, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();
    let targetId = data.targetWatchlistId;

    if (data.newWatchlistName && !targetId) {
      const newWatchlistName = data.newWatchlistName;
      const values: { name: string; description: string | null } = {
        name: newWatchlistName,
        description: "Merged watchlist",
      };

      const [newList] = yield* Effect.tryPromise({
        try: () => db.insert(watchlists).values(values).returning(),
        catch: (error) => new Error(`Failed to create target watchlist: ${String(error)}`),
      });
      targetId = newList.id;
    }

    if (!targetId) {
      return yield* Effect.fail(new Error("Target watchlist ID resolution failed"));
    }

    const sourceItems = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(inArray(watchlistItems.watchlistId, data.sourceWatchlistIds)),
      catch: (error) => new Error(`Failed to fetch source watchlist items: ${String(error)}`),
    });

    if (sourceItems.length > 0) {
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
        isWatched: item.isWatched,
        addedAt: item.addedAt,
      }));

      const CHUNK_SIZE = 50;
      for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
        const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);

        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(watchlistItems)
              .values(chunk)
              .onConflictDoUpdate({
                target: [
                  watchlistItems.watchlistId,
                  watchlistItems.tmdbId,
                  watchlistItems.mediaType,
                ],
                set: {
                  isWatched: sql`CASE WHEN ${watchlistItems.isWatched} OR excluded.is_watched THEN 1 ELSE 0 END`,
                },
              }),
          catch: (error) => new Error(`Failed to insert watchlist items: ${String(error)}`),
        });
      }

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(watchlists)
            .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(watchlists.id, targetId)),
        catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
      });
    }

    const sourcesToDelete = data.sourceWatchlistIds.filter((id) => id !== targetId);
    if (sourcesToDelete.length > 0) {
      yield* Effect.tryPromise({
        try: () => db.delete(watchlists).where(inArray(watchlists.id, sourcesToDelete)),
        catch: (error) => new Error(`Failed to delete source watchlists: ${String(error)}`),
      });
    }

    return { success: true, targetId };
  });
}

export const getWatchlists = createServerFn()
  .inputValidator((data) =>
    z
      .object({
        sortBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional().default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
      })
      .parse(data || {}),
  )
  .handler(({ data }) =>
    runServerHandler(getWatchlistsProgram(data.sortBy, data.sortOrder), "Get watchlists failed"),
  );

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
  .handler(({ data }) =>
    runServerHandler(
      Effect.gen(function* () {
        const { queryWatchlistDetailsById } = yield* Effect.tryPromise(
          () => import("./-watchlist-details-query.server"),
        );
        return queryWatchlistDetailsById(data);
      }),
      "Get watchlist by id failed",
    ),
  );

export const createWatchlist = createServerFn()
  .inputValidator((data) => watchlistSchema.parse(data))
  .handler(({ data }) => runServerHandler(createWatchlistProgram(data), "Create watchlist failed"));

export const deleteWatchlist = createServerFn()
  .inputValidator((data) => deleteWatchlistSchema.parse(data))
  .handler(({ data }) =>
    runServerHandler(deleteWatchlistProgram(data.id), "Delete watchlist failed"),
  );

export const mergeWatchlists = createServerFn({ method: "POST" })
  .inputValidator((data) => mergeWatchlistSchema.parse(data))
  .handler(({ data }) => runServerHandler(mergeWatchlistsProgram(data), "Merge watchlists failed"));
