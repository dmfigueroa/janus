"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db";
import { watchlistItems } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getTVDetails, getSeasonDetails, getMovieDetails } from "./tmdb";

export type { Watchlist, WatchlistItem } from "../db/schema";

const addToWatchlistSchema = z.object({
  watchlistId: z.number(),
  media: z.object({
    id: z.number(),
    media_type: z.enum(["movie", "tv"]).optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    poster_path: z.string().nullable(),
    release_date: z.string().optional(),
    first_air_date: z.string().optional(),
    vote_average: z.number(),
    overview: z.string(),
  }),
});

export const toggleWatched = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemId: z.number(), isWatched: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    await db
      .update(watchlistItems)
      .set({ isWatched: data.isWatched })
      .where(eq(watchlistItems.id, data.itemId));
    return { success: true };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data) => addToWatchlistSchema.parse(data))
  .handler(async ({ data }) => {
    const { watchlistId, media } = data;
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error("TMDB_API_KEY is not configured");
    }

    if (media.media_type === "movie") {
      return await addMovieToWatchList(watchlistId, media, apiKey);
    } else if (media.media_type === "tv") {
      return await addTVShowToWatchList(watchlistId, media, apiKey);
    }

    return { success: false, message: "Unsupported media type" };
  });

const addMovieToWatchList = async (watchlistId: number, media: any, apiKey: string) => {
  const existing = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.tmdbId, media.id),
        eq(watchlistItems.mediaType, "movie"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { success: true, message: "Already in watchlist" };
  }

  const details = await getMovieDetails(media.id, apiKey);

  await db.insert(watchlistItems).values({
    watchlistId,
    tmdbId: media.id,
    mediaType: "movie",
    title: details.title || details.name || "Unknown",
    posterPath: details.poster_path,
    releaseDate: details.release_date,
    voteAverage: details.vote_average,
    runtime: details.runtime || 0,
  });

  return { success: true, message: "Added to watchlist" };
};

const addTVShowToWatchList = async (watchlistId: number, media: any, apiKey: string) => {
  const showDetails = await getTVDetails(media.id, apiKey);
  const seasons = showDetails.seasons || [];

  const allEpisodes = await Promise.all(
    seasons
      .filter((s: any) => s.season_number !== 0)
      .map((season: any) =>
        getSeasonDetails(media.id, season.season_number, apiKey).then(
          (seasonDetails) => seasonDetails.episodes,
        ),
      ),
  ).then((seasonDetails) =>
    seasonDetails.flat().map((ep: any) => ({
      watchlistId,
      tmdbId: ep.id,
      mediaType: "episode" as const,
      title: ep.name,
      parentTitle: media.name || media.title,
      season: ep.season_number,
      episode: ep.episode_number,
      posterPath: ep.still_path || media.poster_path,
      releaseDate: ep.air_date,
      voteAverage: ep.vote_average,
      runtime: ep.runtime || 0,
    })),
  );

  if (allEpisodes.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < allEpisodes.length; i += chunkSize) {
      const chunk = allEpisodes.slice(i, i + chunkSize);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }
  }

  return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
};
