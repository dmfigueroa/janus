"use server";

import { createServerFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";
import { z } from "zod";
import { watchlistItems, watchlists } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  getTVDetails,
  getSeasonDetails,
  getMovieDetails,
} from "@/routes/_shared/providers/-tmdb.server";
import { getComicIssues } from "@/routes/_shared/providers/-comicvine.server";
import { getBookDetails } from "@/routes/_shared/providers/-google-books.server";
import { getGameDetails } from "@/routes/_shared/providers/-rawg.server";
import { getAnilistDetails } from "@/routes/_shared/providers/-anilist.server";
import { runServerHandler } from "@/routes/_shared/-effect";
import { getDatabase } from "@/db/server.server";
import {
  DatabaseError,
  WatchlistItemNotFoundError,
  InvalidMediaError,
  ExternalApiError,
  ConfigurationError,
  type WatchlistError,
} from "./-errors";

type DbError = DatabaseError | ConfigurationError;
import {
  TmdbMovieSchema,
  TmdbTVShowSchema,
  TmdbSeasonDetailsSchema,
  AniListDetailsSchema,
} from "./-schemas";

export type { Watchlist, WatchlistItem } from "@/db/schema";

const DB_INSERT_CHUNK_SIZE = 50;

const addToWatchlistSchema = z.object({
  watchlistId: z.number(),
  media: z.object({
    id: z.string(),
    mediaType: z.enum(["movie", "tv", "game", "book", "comic", "anime", "manga"]),
    source: z.enum(["tmdb", "google_books", "rawg", "comicvine", "anilist", "custom"]),
    title: z.string(),
    poster: z.string().nullable(),
    year: z.string().optional(),
    releaseDate: z.string().optional(),
    rating: z.number().optional(),
    overview: z.string().optional(),
  }),
});

type WatchlistMedia = z.infer<typeof addToWatchlistSchema>["media"];
type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};
type AddToWatchlistResult = { success: boolean; message: string };

function isGenericMedia(media: WatchlistMedia): media is GenericMedia {
  return media.mediaType !== "tv";
}

function splitIntoBatches<T>(
  items: ReadonlyArray<T>,
  batchSize: number,
): ReadonlyArray<ReadonlyArray<T>> {
  return Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
    items.slice(index * batchSize, (index + 1) * batchSize),
  );
}

// Database operations with typed errors
function fetchWatchlistItemById(
  itemId: number,
): Effect.Effect<{ watchlistId: number }, WatchlistItemNotFoundError | DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    const items = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ watchlistId: watchlistItems.watchlistId })
          .from(watchlistItems)
          .where(eq(watchlistItems.id, itemId)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to fetch watchlist item",
          cause: error,
        }),
    });

    if (items.length === 0) {
      return yield* Effect.fail(new WatchlistItemNotFoundError({ id: itemId }));
    }

    return items[0];
  });
}

function updateWatchlistItemWatchedStatus(
  itemId: number,
  isWatched: boolean,
): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    yield* Effect.tryPromise({
      try: () => db.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to update watchlist item",
          cause: error,
        }),
    });
  });
}

function updateWatchlistLastWatchedAt(watchlistId: number): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(watchlists)
          .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId)),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to update watchlist lastWatchedAt",
          cause: error,
        }),
    });
  });
}

function checkExistingItem(
  watchlistId: number,
  tmdbId: string,
  mediaType: "movie" | "episode" | "game" | "book" | "comic" | "anime" | "manga",
): Effect.Effect<boolean, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, watchlistId),
              eq(watchlistItems.tmdbId, tmdbId),
              eq(watchlistItems.mediaType, mediaType),
            ),
          )
          .limit(1),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to check existing item",
          cause: error,
        }),
    });

    return existing.length > 0;
  });
}

function insertWatchlistItem(
  item: typeof watchlistItems.$inferInsert,
): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    yield* Effect.tryPromise({
      try: () => db.insert(watchlistItems).values(item),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to insert watchlist item",
          cause: error,
        }),
    });
  });
}

function insertWatchlistItemBatches(
  items: ReadonlyArray<typeof watchlistItems.$inferInsert>,
  errorMessage: string,
): Effect.Effect<void, DbError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();
    const batches = splitIntoBatches(items, DB_INSERT_CHUNK_SIZE);

    yield* Effect.forEach(
      batches,
      (batch) =>
        Effect.tryPromise({
          try: () =>
            db
              .insert(watchlistItems)
              .values(batch as (typeof watchlistItems.$inferInsert)[])
              .onConflictDoNothing(),
          catch: (error) =>
            new DatabaseError({
              message: `${errorMessage}: ${String(error)}`,
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
          message: "Failed to update watchlist",
          cause: error,
        }),
    });
  });
}

// Handler runner for trying multiple handlers
function runAddHandlersEffect(
  handlers: ReadonlyArray<
    (
      watchlistId: number,
      media: WatchlistMedia,
    ) => Effect.Effect<AddToWatchlistResult | null, WatchlistError>
  >,
  watchlistId: number,
  media: WatchlistMedia,
  index: number = 0,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (index >= handlers.length) {
    return Effect.succeed(null);
  }

  return handlers[index](watchlistId, media).pipe(
    Effect.flatMap((result) =>
      result
        ? Effect.succeed(result)
        : runAddHandlersEffect(handlers, watchlistId, media, index + 1),
    ),
  );
}

// Media-specific handlers with Schema validation
function addTmdbTvMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.mediaType !== "tv") {
    return Effect.succeed(null);
  }

  if (media.source !== "tmdb") {
    if (media.source !== "custom") {
      return Effect.fail(
        new InvalidMediaError({
          message: "TV shows from non-TMDB sources are not supported as generic items",
          mediaType: media.mediaType,
          source: media.source,
        }),
      );
    }
    return Effect.succeed(null);
  }

  return addTVShowToWatchListEffect(watchlistId, Number.parseInt(media.id, 10), media);
}

function addTmdbMovieMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.source !== "tmdb" || media.mediaType !== "movie") {
    return Effect.succeed(null);
  }

  return addMovieToWatchListEffect(watchlistId, Number.parseInt(media.id, 10));
}

function addComicMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.source !== "comicvine" || media.mediaType !== "comic") {
    return Effect.succeed(null);
  }

  return Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("COMICVINE_API_KEY");
    return yield* addComicToWatchListEffect(watchlistId, media.id, media, apiKey);
  });
}

function addBookMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.source !== "google_books" || media.mediaType !== "book") {
    return Effect.succeed(null);
  }

  return Effect.gen(function* () {
    const details = yield* getBookDetails(media.id).pipe(
      Effect.mapError(toExternalApiError("google_books", "Failed to fetch Google Books details")),
    );
    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      ...details,
      mediaType: "book",
    });
  });
}

function addGameMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.source !== "rawg" || media.mediaType !== "game") {
    return Effect.succeed(null);
  }

  return Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("RAWG_API_KEY");
    const details = yield* getGameDetails(media.id, apiKey).pipe(
      Effect.mapError(toExternalApiError("rawg", "Failed to fetch RAWG game details")),
    );
    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      ...details,
      mediaType: "game",
    });
  });
}

function addAniListMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, WatchlistError> {
  if (media.source !== "anilist") {
    return Effect.succeed(null);
  }

  if (media.mediaType === "anime") {
    return addAnimeToWatchlistEffect(watchlistId, media.id, media);
  }

  if (media.mediaType === "manga") {
    return addMangaToWatchlistEffect(watchlistId, media.id, media);
  }

  return Effect.succeed(null);
}

function requireEnvVar(name: string): Effect.Effect<string, WatchlistError> {
  return Effect.gen(function* () {
    const value = process.env[name];
    if (!value) {
      return yield* Effect.fail(
        new ConfigurationError({
          variable: name,
        }),
      );
    }
    return value;
  });
}

function toExternalApiError(provider: string, context: string) {
  return (error: unknown) =>
    new ExternalApiError({
      message: `${context}: ${error instanceof Error ? error.message : String(error)}`,
      provider,
      cause: error,
    });
}

// Server function exports
export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(({ data }) => {
    const program = Effect.gen(function* () {
      const item = yield* fetchWatchlistItemById(data.itemId);
      yield* updateWatchlistItemWatchedStatus(data.itemId, data.isWatched);

      if (data.isWatched) {
        yield* updateWatchlistLastWatchedAt(item.watchlistId);
      }

      return { success: true };
    });

    return runServerHandler(program, "Toggle watched failed");
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(({ data }) => {
    const { watchlistId, media } = data;

    const handlers = [
      addTmdbTvMediaEffect,
      addTmdbMovieMediaEffect,
      addComicMediaEffect,
      addBookMediaEffect,
      addGameMediaEffect,
      addAniListMediaEffect,
    ] as const;

    const program = Effect.gen(function* () {
      const result = yield* runAddHandlersEffect(handlers, watchlistId, media);
      if (result) {
        return result;
      }

      if (!isGenericMedia(media)) {
        return yield* Effect.fail(
          new InvalidMediaError({
            message: "Custom TV shows are not supported for manual item insertion",
            mediaType: media.mediaType,
          }),
        );
      }

      return yield* addGenericItemToWatchlistEffect(watchlistId, media);
    });

    return runServerHandler(program, "Add to watchlist failed");
  });

function addGenericItemToWatchlistEffect(
  watchlistId: number,
  media: GenericMedia,
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const exists = yield* checkExistingItem(watchlistId, media.id, media.mediaType);

    if (exists) {
      return { success: true, message: "Already in watchlist" };
    }

    yield* insertWatchlistItem({
      watchlistId,
      tmdbId: media.id,
      source: media.source,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.poster,
      releaseDate: media.releaseDate || media.year || null,
      voteAverage: media.rating ?? null,
      runtime: 0,
    });

    yield* updateWatchlistLastItemAddedAt(watchlistId);

    return { success: true, message: "Added to watchlist" };
  });
}

function addMovieToWatchListEffect(
  watchlistId: number,
  tmdbId: number,
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const exists = yield* checkExistingItem(watchlistId, tmdbId.toString(), "movie");

    if (exists) {
      return { success: true, message: "Already in watchlist" };
    }

    const details = yield* getMovieDetails(tmdbId).pipe(
      Effect.mapError(toExternalApiError("tmdb", "Failed to fetch TMDB movie details")),
      Effect.flatMap((data) =>
        Schema.decodeUnknown(TmdbMovieSchema)(data).pipe(
          Effect.mapError(
            (error) =>
              new ExternalApiError({
                message: `Invalid TMDB movie data: ${String(error)}`,
                provider: "tmdb",
                cause: error,
              }),
          ),
        ),
      ),
    );

    yield* insertWatchlistItem({
      watchlistId,
      tmdbId: tmdbId.toString(),
      source: "tmdb",
      mediaType: "movie",
      title: details.title || details.name || "Unknown",
      posterPath: details.poster_path,
      releaseDate: details.release_date ?? null,
      voteAverage: details.vote_average ?? null,
      runtime: details.runtime ?? 0,
    });

    yield* updateWatchlistLastItemAddedAt(watchlistId);

    return { success: true, message: "Added to watchlist" };
  });
}

function addTVShowToWatchListEffect(
  watchlistId: number,
  tmdbId: number,
  media: z.infer<typeof addToWatchlistSchema>["media"],
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const showDetails = yield* getTVDetails(tmdbId).pipe(
      Effect.mapError(toExternalApiError("tmdb", "Failed to fetch TMDB TV details")),
      Effect.flatMap((data) =>
        Schema.decodeUnknown(TmdbTVShowSchema)(data).pipe(
          Effect.mapError(
            (error) =>
              new ExternalApiError({
                message: `Invalid TMDB TV show data: ${String(error)}`,
                provider: "tmdb",
                cause: error,
              }),
          ),
        ),
      ),
    );

    const seasons = showDetails.seasons || [];

    // Use Effect concurrency instead of p-limit
    const allEpisodes = yield* Effect.forEach(
      seasons.filter((s) => s.season_number !== 0),
      (season) =>
        Effect.gen(function* () {
          const seasonDetails = yield* getSeasonDetails(tmdbId, season.season_number).pipe(
            Effect.mapError(
              toExternalApiError(
                "tmdb",
                `Failed to fetch TMDB season ${season.season_number} details`,
              ),
            ),
            Effect.flatMap((data) =>
              Schema.decodeUnknown(TmdbSeasonDetailsSchema)(data).pipe(
                Effect.mapError(
                  (error) =>
                    new ExternalApiError({
                      message: `Invalid TMDB season data: ${String(error)}`,
                      provider: "tmdb",
                      cause: error,
                    }),
                ),
              ),
            ),
          );
          return seasonDetails.episodes;
        }),
      { concurrency: 5 }, // Replace p-limit(5) with Effect concurrency
    );

    const episodes = allEpisodes.flat().map((ep) => ({
      watchlistId,
      tmdbId: ep.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: ep.name,
      parentTitle: media.title,
      season: ep.season_number,
      episode: ep.episode_number.toString(),
      posterPath: ep.still_path || showDetails.poster_path || null,
      releaseDate: ep.air_date ?? null,
      voteAverage: ep.vote_average ?? null,
      runtime: ep.runtime ?? 0,
    }));

    if (episodes.length > 0) {
      yield* insertWatchlistItemBatches(episodes, "Failed to insert episodes");
      yield* updateWatchlistLastItemAddedAt(watchlistId);
    }

    return { success: true, message: `Added ${episodes.length} episodes to watchlist` };
  });
}

function addComicToWatchListEffect(
  watchlistId: number,
  volumeId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
  apiKey: string,
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const db = yield* getDatabase();

    const existingComicRows = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ tmdbId: watchlistItems.tmdbId })
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, watchlistId),
              eq(watchlistItems.mediaType, "comic"),
              eq(watchlistItems.source, "comicvine"),
            ),
          ),
      catch: (error) =>
        new DatabaseError({
          message: "Failed to check existing comics",
          cause: error,
        }),
    });

    const existingIssueIds = new Set(existingComicRows.map((row) => row.tmdbId));
    const issues = yield* getComicIssues(volumeId, apiKey, {
      knownIssueIds: existingIssueIds,
    }).pipe(Effect.mapError(toExternalApiError("comicvine", "Failed to fetch ComicVine issues")));

    if (issues.length === 0) {
      return {
        success: true,
        message:
          existingIssueIds.size > 0
            ? "No new issues found for this volume"
            : "No issues found for this volume",
      };
    }

    const watchlistItemsData = issues.map((issue) => ({
      watchlistId,
      tmdbId: issue.id,
      source: "comicvine" as const,
      mediaType: "comic" as const,
      title: issue.title,
      parentTitle: media.title,
      season: null,
      episode: issue.issueNumber,
      posterPath: issue.poster,
      releaseDate: issue.coverDate,
      voteAverage: 0,
      runtime: 0,
    }));

    yield* insertWatchlistItemBatches(watchlistItemsData, "Failed to insert comic issues");
    yield* updateWatchlistLastItemAddedAt(watchlistId);

    const newIssueCount = watchlistItemsData.length;
    const message =
      existingIssueIds.size > 0
        ? `Added ${newIssueCount} new issues to watchlist`
        : `Added ${newIssueCount} issues to watchlist`;

    return { success: true, message };
  });
}

function addAnimeToWatchlistEffect(
  watchlistId: number,
  aniListId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const details = yield* getAnilistDetails(aniListId).pipe(
      Effect.mapError(toExternalApiError("anilist", "Failed to fetch AniList details")),
      Effect.flatMap((data) =>
        Schema.decodeUnknown(AniListDetailsSchema)(data).pipe(
          Effect.mapError(
            (error) =>
              new ExternalApiError({
                message: `Invalid AniList data: ${String(error)}`,
                provider: "anilist",
                cause: error,
              }),
          ),
        ),
      ),
    );

    if (details.episodes && details.episodes > 0) {
      const episodesCount = details.episodes;
      const allEpisodes = Array.from({ length: episodesCount }, (_, i) => ({
        watchlistId,
        tmdbId: `${aniListId}-ep${i + 1}`,
        source: "anilist" as const,
        mediaType: "episode" as const,
        title: `Episode ${i + 1}`,
        parentTitle: media.title,
        season: 1,
        episode: (i + 1).toString(),
        posterPath: details.poster,
        releaseDate: details.releaseDate ?? null,
        voteAverage: details.rating ?? 0,
        runtime: 0,
      }));

      yield* insertWatchlistItemBatches(allEpisodes, "Failed to insert anime episodes");
      yield* updateWatchlistLastItemAddedAt(watchlistId);

      return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
    }

    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      id: aniListId,
      title: details.title,
      poster: details.poster,
      releaseDate: details.releaseDate,
      rating: details.rating,
      source: "anilist",
      mediaType: "anime",
    });
  });
}

function addMangaToWatchlistEffect(
  watchlistId: number,
  aniListId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
): Effect.Effect<AddToWatchlistResult, WatchlistError> {
  return Effect.gen(function* () {
    const details = yield* getAnilistDetails(aniListId).pipe(
      Effect.mapError(toExternalApiError("anilist", "Failed to fetch AniList details")),
      Effect.flatMap((data) =>
        Schema.decodeUnknown(AniListDetailsSchema)(data).pipe(
          Effect.mapError(
            (error) =>
              new ExternalApiError({
                message: `Invalid AniList data: ${String(error)}`,
                provider: "anilist",
                cause: error,
              }),
          ),
        ),
      ),
    );

    const count = details.volumes || details.chapters || 0;
    const label = details.volumes ? "Volume" : "Chapter";

    if (count > 0) {
      const items = Array.from({ length: count }, (_, i) => ({
        watchlistId,
        tmdbId: `${aniListId}-${label.toLowerCase()}${i + 1}`,
        source: "anilist" as const,
        mediaType: "manga" as const,
        title: `${label} ${i + 1}`,
        parentTitle: media.title,
        season: null,
        episode: (i + 1).toString(),
        posterPath: details.poster,
        releaseDate: details.releaseDate ?? null,
        voteAverage: details.rating ?? 0,
        runtime: 0,
      }));

      yield* insertWatchlistItemBatches(items, "Failed to insert manga items");
      yield* updateWatchlistLastItemAddedAt(watchlistId);

      return {
        success: true,
        message: `Added ${items.length} ${label.toLowerCase()}s to watchlist`,
      };
    }

    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      id: aniListId,
      title: details.title,
      poster: details.poster,
      releaseDate: details.releaseDate,
      rating: details.rating,
      source: "anilist",
      mediaType: "manga",
    });
  });
}
