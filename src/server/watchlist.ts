"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pLimit from "p-limit";
import { watchlistItems, watchlists } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getTVDetails, getSeasonDetails, getMovieDetails } from "./tmdb";
import { getComicIssues } from "./comicvine";
import { getBookDetails } from "./google-books";
import { getGameDetails } from "./rawg";
import { getAnilistDetails } from "./anilist";

export type { Watchlist, WatchlistItem } from "../db/schema";

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

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { getDb } = await import("../db/server.server");
    const db = getDb();
    const [item] = await db
      .select({ watchlistId: watchlistItems.watchlistId })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, data.itemId));

    await db
      .update(watchlistItems)
      .set({ isWatched: data.isWatched })
      .where(eq(watchlistItems.id, data.itemId));

    if (item && data.isWatched) {
      await db
        .update(watchlists)
        .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, item.watchlistId));
    }

    return { success: true };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { watchlistId, media } = data;

    if (media.mediaType === "tv") {
      if (media.source === "tmdb") {
        const tmdbId = parseInt(media.id);
        return await addTVShowToWatchList(watchlistId, tmdbId, media);
      }
      // Custom TV shows fall through to addGenericItemToWatchlist
      if (media.source !== "custom") {
        throw new Error("TV shows from non-TMDB sources are not supported as generic items");
      }
    }

    if (media.source === "tmdb") {
      const tmdbId = parseInt(media.id);

      if (media.mediaType === "movie") {
        return await addMovieToWatchList(watchlistId, tmdbId);
      }
    }

    if (media.source === "comicvine" && media.mediaType === "comic") {
      const cvApiKey = process.env.COMICVINE_API_KEY;
      if (!cvApiKey) throw new Error("COMICVINE_API_KEY is not configured");
      return await addComicToWatchList(watchlistId, media.id, media, cvApiKey);
    }

    if (media.source === "google_books" && media.mediaType === "book") {
      const details = await getBookDetails(media.id);
      return await addGenericItemToWatchlist(watchlistId, details);
    }

    if (media.source === "rawg" && media.mediaType === "game") {
      const rawgApiKey = process.env.RAWG_API_KEY;
      if (!rawgApiKey) throw new Error("RAWG_API_KEY is not configured");
      const details = await getGameDetails(media.id, rawgApiKey);
      return await addGenericItemToWatchlist(watchlistId, details);
    }

    if (media.source === "anilist") {
      if (media.mediaType === "anime") {
        return await addAnimeToWatchlist(watchlistId, media.id, media);
      }
      if (media.mediaType === "manga") {
        return await addMangaToWatchlist(watchlistId, media.id, media);
      }
    }

    // TypeScript now knows media.mediaType is not "tv", so it matches GenericMedia
    return await addGenericItemToWatchlist(watchlistId, media as GenericMedia);
  });

const addGenericItemToWatchlist = async (watchlistId: number, media: GenericMedia) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const existing = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.tmdbId, media.id),
        eq(watchlistItems.mediaType, media.mediaType),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { success: true, message: "Already in watchlist" };
  }

  await db.insert(watchlistItems).values({
    watchlistId,
    tmdbId: media.id,
    source: media.source,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.poster,
    releaseDate: media.releaseDate || media.year,
    voteAverage: media.rating,
    runtime: 0,
  });

  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));

  return { success: true, message: "Added to watchlist" };
};

const addMovieToWatchList = async (watchlistId: number, tmdbId: number) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const existing = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.tmdbId, tmdbId.toString()),
        eq(watchlistItems.mediaType, "movie"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { success: true, message: "Already in watchlist" };
  }

  const details = await getMovieDetails({ data: { id: tmdbId } });

  await db.insert(watchlistItems).values({
    watchlistId,
    tmdbId: tmdbId.toString(),
    source: "tmdb",
    mediaType: "movie",
    title: details.title || details.name || "Unknown",
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  });

  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));

  return { success: true, message: "Added to watchlist" };
};

const addTVShowToWatchList = async (
  watchlistId: number,
  tmdbId: number,
  media: z.infer<typeof addToWatchlistSchema>["media"],
) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const showDetails = await getTVDetails({ data: { id: tmdbId } });
  const seasons = showDetails.seasons || [];

  const allEpisodes = await Promise.all(
    seasons
      .filter((s: any) => s.season_number !== 0)
      .map((season: any) =>
        limit(() =>
          getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
            (seasonDetails) => seasonDetails.episodes,
          ),
        ),
      ),
  ).then((seasonDetails) =>
    seasonDetails.flat().map((ep: any) => ({
      watchlistId,
      tmdbId: ep.id.toString(),
      source: "tmdb",
      mediaType: "episode" as const,
      title: ep.name,
      parentTitle: media.title,
      season: ep.season_number,
      episode: ep.episode_number.toString(),
      posterPath: ep.still_path || showDetails.poster_path,
      releaseDate: ep.air_date,
      voteAverage: ep.vote_average,
      runtime: ep.runtime || 0,
    })),
  );

  if (allEpisodes.length > 0) {
    for (let i = 0; i < allEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = allEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }
  }

  if (allEpisodes.length > 0) {
    await db
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, watchlistId));
  }

  return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
};

const addComicToWatchList = async (
  watchlistId: number,
  volumeId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
  apiKey: string,
) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const issues = await getComicIssues(volumeId, apiKey);

  if (issues.length === 0) {
    return { success: false, message: "No issues found for this volume" };
  }

  const watchlistItemsData = issues.map((issue) => ({
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine",
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
    await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
  }

  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));

  return { success: true, message: `Added ${watchlistItemsData.length} issues to watchlist` };
};

const addAnimeToWatchlist = async (
  watchlistId: number,
  aniListId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const details = await getAnilistDetails(aniListId);

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
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    }));

    for (let i = 0; i < allEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = allEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }

    await db
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, watchlistId));

    return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
  }

  return await addGenericItemToWatchlist(watchlistId, {
    ...details,
    mediaType: "anime",
  } as unknown as GenericMedia);
};

const addMangaToWatchlist = async (
  watchlistId: number,
  aniListId: string,
  media: z.infer<typeof addToWatchlistSchema>["media"],
) => {
  const { getDb } = await import("../db/server.server");
  const db = getDb();
  const details = await getAnilistDetails(aniListId);

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
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    }));

    for (let i = 0; i < items.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = items.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }

    await db
      .update(watchlists)
      .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(watchlists.id, watchlistId));

    return { success: true, message: `Added ${items.length} ${label.toLowerCase()}s to watchlist` };
  }

  return await addGenericItemToWatchlist(watchlistId, {
    ...details,
    mediaType: "manga",
  } as unknown as GenericMedia);
};
