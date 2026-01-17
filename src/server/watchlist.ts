"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db";
import { watchlistItems } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getTVDetails, getSeasonDetails, getMovieDetails } from "./tmdb";
import { getComicIssues } from "./external-apis";

export type { Watchlist, WatchlistItem } from "../db/schema";

const addToWatchlistSchema = z.object({
  watchlistId: z.number(),
  media: z.object({
    id: z.string(),
    mediaType: z.enum(["movie", "tv", "game", "book", "comic"]),
    source: z.enum(["tmdb", "google_books", "rawg", "comicvine"]),
    title: z.string(),
    poster: z.string().nullable(),
    year: z.string().optional(),
    rating: z.number().optional(),
    overview: z.string().optional(),
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

    if (media.source === "tmdb") {
      if (!apiKey) throw new Error("TMDB_API_KEY is not configured");
      const tmdbId = parseInt(media.id);

      if (media.mediaType === "movie") {
        return await addMovieToWatchList(watchlistId, tmdbId, apiKey);
      } else if (media.mediaType === "tv") {
        return await addTVShowToWatchList(watchlistId, tmdbId, media, apiKey);
      }
    }

    if (media.source === "comicvine" && media.mediaType === "comic") {
      const cvApiKey = process.env.COMICVINE_API_KEY;
      if (!cvApiKey) throw new Error("COMICVINE_API_KEY is not configured");
      return await addComicToWatchList(watchlistId, media.id, media, cvApiKey);
    }

    return await addGenericItemToWatchlist(watchlistId, media);
  });

const addGenericItemToWatchlist = async (watchlistId: number, media: any) => {
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
    releaseDate: media.year,
    voteAverage: media.rating,
    runtime: 0,
  });

  return { success: true, message: "Added to watchlist" };
};

const addMovieToWatchList = async (watchlistId: number, tmdbId: number, apiKey: string) => {
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

  const details = await getMovieDetails(tmdbId, apiKey);

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

  return { success: true, message: "Added to watchlist" };
};

const addTVShowToWatchList = async (
  watchlistId: number,
  tmdbId: number,
  media: any,
  apiKey: string,
) => {
  const showDetails = await getTVDetails(tmdbId, apiKey);
  const seasons = showDetails.seasons || [];

  const allEpisodes = await Promise.all(
    seasons
      .filter((s: any) => s.season_number !== 0)
      .map((season: any) =>
        getSeasonDetails(tmdbId, season.season_number, apiKey).then(
          (seasonDetails) => seasonDetails.episodes,
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
      episode: ep.episode_number,
      posterPath: ep.still_path || showDetails.poster_path,
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

const addComicToWatchList = async (
  watchlistId: number,
  volumeId: string,
  media: any,
  apiKey: string,
) => {
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
    episode:
      issue.issueNumber && !isNaN(parseInt(issue.issueNumber)) ? parseInt(issue.issueNumber) : null,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  }));

  const chunkSize = 50;
  for (let i = 0; i < watchlistItemsData.length; i += chunkSize) {
    const chunk = watchlistItemsData.slice(i, i + chunkSize);
    await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
  }

  return { success: true, message: `Added ${watchlistItemsData.length} issues to watchlist` };
};
