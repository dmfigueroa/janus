"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db";
import { watchlistItems } from "../db/schema";
import { eq, and, asc } from "drizzle-orm";
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

export const getWatchlistDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ watchlistId: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const items = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, data.watchlistId))
      .orderBy(asc(watchlistItems.releaseDate)); // Chronological order
    return items;
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
      // Check if already exists
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

      // Fetch runtime
      let runtime = 0;
      try {
        const details = await getMovieDetails(media.id, apiKey);
        runtime = details.runtime || 0;
      } catch (e) {
        console.error("Failed to fetch runtime", e);
      }

      await db.insert(watchlistItems).values({
        watchlistId,
        tmdbId: media.id,
        mediaType: "movie",
        title: media.title || media.name || "Unknown",
        posterPath: media.poster_path,
        releaseDate: media.release_date || media.first_air_date,
        voteAverage: media.vote_average,
        runtime,
      });

      return { success: true, message: "Added to watchlist" };
    } else if (media.media_type === "tv") {
      // Fetch details to get seasons
      const showDetails = await getTVDetails(media.id, apiKey);
      const seasons = showDetails.seasons || [];

      let addedCount = 0;
      const allEpisodes: any[] = [];

      // Collect all episodes
      for (const season of seasons) {
        if (season.season_number === 0) continue;

        const seasonDetails = await getSeasonDetails(media.id, season.season_number, apiKey);

        if (seasonDetails.episodes) {
          for (const ep of seasonDetails.episodes) {
            allEpisodes.push({
              watchlistId,
              tmdbId: ep.id,
              mediaType: "episode",
              title: ep.name,
              parentTitle: media.name || media.title,
              season: ep.season_number,
              episode: ep.episode_number,
              posterPath: ep.still_path || media.poster_path,
              releaseDate: ep.air_date,
              voteAverage: ep.vote_average,
              runtime: ep.runtime, // Episodes usually have runtime
            });
          }
        }
      }

      if (allEpisodes.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < allEpisodes.length; i += chunkSize) {
          const chunk = allEpisodes.slice(i, i + chunkSize);
          await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
        }
        addedCount = allEpisodes.length;
      }

      return { success: true, message: `Added ${addedCount} episodes to watchlist` };
    }

    return { success: false, message: "Unsupported media type" };
  });
