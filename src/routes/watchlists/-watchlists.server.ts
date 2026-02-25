"use server";

import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { watchlists, watchlistItems } from "@/db/schema";
import { eq, desc, inArray, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { runServerHandler } from "@/routes/_shared/-effect";
import { getDatabase } from "@/db/server.server";
import {
  DatabaseError,
  WatchlistNotFoundError,
  MergeWatchlistError,
  ConfigurationError,
  type WatchlistError,
} from "./watchlist/-errors";

type DbError = DatabaseError | ConfigurationError;

// Zod schemas for input validation
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

// Sorting helpers
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

function splitIntoBatches<T>(items: ReadonlyArray<T>, batchSize: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
    items.slice(index * batchSize, (index + 1) * batchSize),
  );
}

// Database operations with typed errors
function fetchAllWatchlists(
  sortBy: SortBy,
  sortOrder: SortOrder,
): Effect.Effect<(typeof watchlists.$inferSelect)[], DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();
    const orderBy = buildOrderBy(sortBy, sortOrder);

    return yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlists)
          .orderBy(...orderBy),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to fetch watchlists",
          cause: error,
        }),
    });
  });
}

function fetchWatchlistItemsByIds(
  listIds: readonly number[],
): Effect.Effect<(typeof watchlistItems.$inferSelect)[], DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    return yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(inArray(watchlistItems.watchlistId, listIds))
          .orderBy(
            sql`CASE WHEN ${watchlistItems.releaseDate} IS NULL OR ${watchlistItems.releaseDate} = '' THEN 1 ELSE 0 END`,
            asc(watchlistItems.releaseDate),
          ),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to fetch watchlist items",
          cause: error,
        }),
    });
  });
}

function insertWatchlist(
  name: string,
  description: string | null,
): Effect.Effect<typeof watchlists.$inferSelect, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    const [newItem] = yield* Effect.tryPromise({
      try: () => db.insert(watchlists).values({ name, description }).returning(),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to create watchlist",
          cause: error,
        }),
    });

    return newItem;
  });
}

function deleteWatchlistById(id: number): Effect.Effect<void, WatchlistNotFoundError | DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    // First check if watchlist exists
    const existing = yield* Effect.tryPromise({
      try: () =>
        db.select({ id: watchlists.id }).from(watchlists).where(eq(watchlists.id, id)).limit(1),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to check watchlist existence",
          cause: error,
        }),
    });

    if (existing.length === 0) {
      return yield* Effect.fail(new WatchlistNotFoundError({ id }));
    }

    yield* Effect.tryPromise({
      try: () => db.delete(watchlists).where(eq(watchlists.id, id)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to delete watchlist",
          cause: error,
        }),
    });
  });
}

function fetchWatchlistItemsByWatchlistIds(
  sourceWatchlistIds: readonly number[],
): Effect.Effect<(typeof watchlistItems.$inferSelect)[], DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    return yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to fetch source watchlist items",
          cause: error,
        }),
    });
  });
}

function insertMergedItemsInBatches(
  itemsToInsert: Array<typeof watchlistItems.$inferInsert>,
): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();
    const CHUNK_SIZE = 50;
    const batches = splitIntoBatches(itemsToInsert, CHUNK_SIZE);

    yield* Effect.forEach(
      batches,
      (batch) =>
        Effect.tryPromise({
          try: () => {
            const records = batch.map((item) => ({ ...item }));
            return db
              .insert(watchlistItems)
              .values(records)
              .onConflictDoUpdate({
                target: [
                  watchlistItems.watchlistId,
                  watchlistItems.tmdbId,
                  watchlistItems.mediaType,
                ],
                set: {
                  isWatched: sql`CASE WHEN ${watchlistItems.isWatched} OR excluded.is_watched THEN 1 ELSE 0 END`,
                },
              });
          },
          catch: (error) =>
            new DatabaseError({
              message: "Failed to insert watchlist items",
              cause: error,
            }),
        }),
      { discard: true },
    );
  });
}

function updateWatchlistLastItemAddedAt(watchlistId: number): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(watchlists)
          .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to update watchlist lastItemAddedAt",
          cause: error,
        }),
    });
  });
}

function deleteWatchlistsByIds(ids: readonly number[]): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    yield* Effect.tryPromise({
      try: () => db.delete(watchlists).where(inArray(watchlists.id, ids)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to delete source watchlists",
          cause: error,
        }),
    });
  });
}

// Business logic programs
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
  WatchlistError
> {
  return Effect.gen(function* () {
    const lists = yield* fetchAllWatchlists(sortBy, sortOrder);

    if (lists.length === 0) {
      return [];
    }

    const listIds = lists.map((l) => l.id);
    const items = yield* fetchWatchlistItemsByIds(listIds);

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
): Effect.Effect<typeof watchlists.$inferSelect, DbError> {
  return insertWatchlist(data.name, data.description ?? null);
}

function deleteWatchlistProgram(id: number): Effect.Effect<{ success: true }, WatchlistError> {
  return Effect.gen(function* () {
    yield* deleteWatchlistById(id);
    return { success: true };
  });
}

function mergeWatchlistsProgram(
  data: z.infer<typeof mergeWatchlistSchema>,
): Effect.Effect<{ success: true; targetId: number }, WatchlistError> {
  return Effect.gen(function* () {
    let targetId = data.targetWatchlistId;

    // Create new watchlist if name provided
    if (data.newWatchlistName && !targetId) {
      const newList = yield* insertWatchlist(data.newWatchlistName, "Merged watchlist");
      targetId = newList.id;
    }

    if (!targetId) {
      return yield* Effect.fail(
        new MergeWatchlistError({
          message: "Target watchlist ID resolution failed",
        }),
      );
    }

    // Fetch and migrate items
    const sourceItems = yield* fetchWatchlistItemsByWatchlistIds(data.sourceWatchlistIds);

    if (sourceItems.length > 0) {
      const itemsToInsert: (typeof watchlistItems.$inferInsert)[] = sourceItems.map((item) => ({
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

      yield* insertMergedItemsInBatches(itemsToInsert);
      yield* updateWatchlistLastItemAddedAt(targetId);
    }

    // Delete source watchlists (excluding target)
    const sourcesToDelete = data.sourceWatchlistIds.filter((id) => id !== targetId);
    if (sourcesToDelete.length > 0) {
      yield* deleteWatchlistsByIds(sourcesToDelete);
    }

    return { success: true, targetId };
  });
}

// Server function exports
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
          () => import("./watchlist/-details-query.server"),
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
