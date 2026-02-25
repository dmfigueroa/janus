"use server";

import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";
import pLimit from "p-limit";
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
import { requireEnvVar, runServerHandler } from "@/routes/_shared/-effect";

export type { Watchlist, WatchlistItem } from "@/db/schema";

const limit = pLimit(5);
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

function getDbEffect() {
  return Effect.tryPromise({
    try: async () => {
      const { getDb: resolveDb } = await import("@/db/server.server");
      return resolveDb();
    },
    catch: (error) => new Error(`Failed to get database: ${String(error)}`),
  });
}

function addTmdbTvMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, Error> {
  if (media.mediaType !== "tv") {
    return Effect.succeed(null);
  }

  if (media.source !== "tmdb") {
    if (media.source !== "custom") {
      return Effect.fail(
        new Error("TV shows from non-TMDB sources are not supported as generic items"),
      );
    }
    return Effect.succeed(null);
  }

  return addTVShowToWatchListEffect(watchlistId, Number.parseInt(media.id, 10), media);
}

function addTmdbMovieMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, Error> {
  if (media.source !== "tmdb" || media.mediaType !== "movie") {
    return Effect.succeed(null);
  }

  return addMovieToWatchListEffect(watchlistId, Number.parseInt(media.id, 10));
}

function addComicMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, Error> {
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
): Effect.Effect<AddToWatchlistResult | null, Error> {
  if (media.source !== "google_books" || media.mediaType !== "book") {
    return Effect.succeed(null);
  }

  return Effect.gen(function* () {
    const details = yield* getBookDetails(media.id);
    return yield* addGenericItemToWatchlistEffect(watchlistId, details as GenericMedia);
  });
}

function addGameMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, Error> {
  if (media.source !== "rawg" || media.mediaType !== "game") {
    return Effect.succeed(null);
  }

  return Effect.gen(function* () {
    const apiKey = yield* requireEnvVar("RAWG_API_KEY");
    const details = yield* getGameDetails(media.id, apiKey);
    return yield* addGenericItemToWatchlistEffect(watchlistId, details as GenericMedia);
  });
}

function addAniListMediaEffect(
  watchlistId: number,
  media: WatchlistMedia,
): Effect.Effect<AddToWatchlistResult | null, Error> {
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

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(({ data }) => {
    const program = Effect.gen(function* () {
      const db = yield* getDbEffect();

      const [item] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ watchlistId: watchlistItems.watchlistId })
            .from(watchlistItems)
            .where(eq(watchlistItems.id, data.itemId)),
        catch: (error) => new Error(`Failed to fetch watchlist item: ${String(error)}`),
      });

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(watchlistItems)
            .set({ isWatched: data.isWatched })
            .where(eq(watchlistItems.id, data.itemId)),
        catch: (error) => new Error(`Failed to update watchlist item: ${String(error)}`),
      });

      if (item && data.isWatched) {
        yield* Effect.tryPromise({
          try: () =>
            db
              .update(watchlists)
              .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
              .where(eq(watchlists.id, item.watchlistId)),
          catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
        });
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
      for (const handler of handlers) {
        const result = yield* handler(watchlistId, media);
        if (result) {
          return result;
        }
      }

      if (!isGenericMedia(media)) {
        return yield* Effect.fail(
          new Error("Custom TV shows are not supported for manual item insertion"),
        );
      }

      return yield* addGenericItemToWatchlistEffect(watchlistId, media);
    });

    return runServerHandler(program, "Add to watchlist failed");
  });

function addGenericItemToWatchlistEffect(
  watchlistId: number,
  media: GenericMedia,
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, watchlistId),
              eq(watchlistItems.tmdbId, media.id),
              eq(watchlistItems.mediaType, media.mediaType),
            ),
          )
          .limit(1),
      catch: (error) => new Error(`Failed to check existing item: ${String(error)}`),
    });

    if (existing.length > 0) {
      return { success: true, message: "Already in watchlist" };
    }

    yield* Effect.tryPromise({
      try: () =>
        db.insert(watchlistItems).values({
          watchlistId,
          tmdbId: media.id,
          source: media.source,
          mediaType: media.mediaType,
          title: media.title,
          posterPath: media.poster,
          releaseDate: media.releaseDate || media.year || null,
          voteAverage: media.rating ?? null,
          runtime: 0,
        }),
      catch: (error) => new Error(`Failed to insert watchlist item: ${String(error)}`),
    });

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(watchlists)
          .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId)),
      catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
    });

    return { success: true, message: "Added to watchlist" };
  });
}

function addMovieToWatchListEffect(
  watchlistId: number,
  tmdbId: number,
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, watchlistId),
              eq(watchlistItems.tmdbId, tmdbId.toString()),
              eq(watchlistItems.mediaType, "movie"),
            ),
          )
          .limit(1),
      catch: (error) => new Error(`Failed to check existing movie: ${String(error)}`),
    });

    if (existing.length > 0) {
      return { success: true, message: "Already in watchlist" };
    }

    const details = yield* getMovieDetails(tmdbId);

    yield* Effect.tryPromise({
      try: () =>
        db.insert(watchlistItems).values({
          watchlistId,
          tmdbId: tmdbId.toString(),
          source: "tmdb",
          mediaType: "movie",
          title:
            (details as { title?: string; name?: string }).title ||
            (details as { title?: string; name?: string }).name ||
            "Unknown",
          posterPath: (details as { poster_path: string | null }).poster_path,
          releaseDate: (details as { release_date?: string }).release_date ?? null,
          voteAverage: (details as { vote_average?: number }).vote_average ?? null,
          runtime: (details as { runtime?: number }).runtime ?? 0,
        }),
      catch: (error) => new Error(`Failed to insert movie: ${String(error)}`),
    });

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(watchlists)
          .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId)),
      catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
    });

    return { success: true, message: "Added to watchlist" };
  });
}

function addTVShowToWatchListEffect(
  watchlistId: number,
  tmdbId: number,
  media: z.infer<typeof addToWatchlistSchema>["media"],
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();
    const showDetails = yield* getTVDetails(tmdbId);
    const seasons = (showDetails as { seasons?: Array<{ season_number: number }> }).seasons || [];

    const allEpisodes = yield* Effect.tryPromise({
      try: async () => {
        return await Promise.all(
          seasons
            .filter((s) => s.season_number !== 0)
            .map((season) =>
              limit(() =>
                Effect.runPromise(getSeasonDetails(tmdbId, season.season_number)).then(
                  (seasonDetails) => (seasonDetails as { episodes: unknown[] }).episodes,
                ),
              ),
            ),
        );
      },
      catch: (error) => new Error(`Failed to fetch TV show seasons: ${String(error)}`),
    });

    const episodes = allEpisodes.flat().map((ep: unknown) => ({
      watchlistId,
      tmdbId: (ep as { id: number }).id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: (ep as { name: string }).name,
      parentTitle: media.title,
      season: (ep as { season_number: number }).season_number,
      episode: (ep as { episode_number: number }).episode_number.toString(),
      posterPath:
        (ep as { still_path?: string }).still_path ||
        (showDetails as { poster_path?: string }).poster_path ||
        null,
      releaseDate: (ep as { air_date?: string }).air_date ?? null,
      voteAverage: (ep as { vote_average?: number }).vote_average ?? null,
      runtime: (ep as { runtime?: number }).runtime ?? 0,
    }));

    if (episodes.length > 0) {
      for (let i = 0; i < episodes.length; i += DB_INSERT_CHUNK_SIZE) {
        const chunk = episodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
        yield* Effect.tryPromise({
          try: () => db.insert(watchlistItems).values(chunk).onConflictDoNothing(),
          catch: (error) => new Error(`Failed to insert episodes: ${String(error)}`),
        });
      }
    }

    if (episodes.length > 0) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(watchlists)
            .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(watchlists.id, watchlistId)),
        catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
      });
    }

    return { success: true, message: `Added ${episodes.length} episodes to watchlist` };
  });
}

function addComicToWatchListEffect(
  watchlistId: number,
  volumeId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
  apiKey: string,
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();

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
      catch: (error) => new Error(`Failed to check existing comics: ${String(error)}`),
    });

    const existingIssueIds = new Set(existingComicRows.map((row) => row.tmdbId));
    const issues = yield* getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });

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

    for (let i = 0; i < watchlistItemsData.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = watchlistItemsData.slice(i, i + DB_INSERT_CHUNK_SIZE);
      yield* Effect.tryPromise({
        try: () => db.insert(watchlistItems).values(chunk).onConflictDoNothing(),
        catch: (error) => new Error(`Failed to insert comic issues: ${String(error)}`),
      });
    }

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(watchlists)
          .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(watchlists.id, watchlistId)),
      catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
    });

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
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();
    const details = yield* getAnilistDetails(aniListId);

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

      for (let i = 0; i < allEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
        const chunk = allEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
        yield* Effect.tryPromise({
          try: () => db.insert(watchlistItems).values(chunk).onConflictDoNothing(),
          catch: (error) => new Error(`Failed to insert anime episodes: ${String(error)}`),
        });
      }

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(watchlists)
            .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(watchlists.id, watchlistId)),
        catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
      });

      return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
    }

    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      ...details,
      mediaType: "anime",
    } as unknown as GenericMedia);
  });
}

function addMangaToWatchlistEffect(
  watchlistId: number,
  aniListId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
): Effect.Effect<AddToWatchlistResult, Error> {
  return Effect.gen(function* () {
    const db = yield* getDbEffect();
    const details = yield* getAnilistDetails(aniListId);

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

      for (let i = 0; i < items.length; i += DB_INSERT_CHUNK_SIZE) {
        const chunk = items.slice(i, i + DB_INSERT_CHUNK_SIZE);
        yield* Effect.tryPromise({
          try: () => db.insert(watchlistItems).values(chunk).onConflictDoNothing(),
          catch: (error) => new Error(`Failed to insert manga items: ${String(error)}`),
        });
      }

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(watchlists)
            .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(watchlists.id, watchlistId)),
        catch: (error) => new Error(`Failed to update watchlist: ${String(error)}`),
      });

      return {
        success: true,
        message: `Added ${items.length} ${label.toLowerCase()}s to watchlist`,
      };
    }

    return yield* addGenericItemToWatchlistEffect(watchlistId, {
      ...details,
      mediaType: "manga",
    } as unknown as GenericMedia);
  });
}
