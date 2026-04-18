"use server";

import pLimit from "p-limit";
import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { getAnilistDetails } from "@/server/providers/anilist.server";
import { getComicIssues } from "@/server/providers/comicvine.server";
import { getBookDetails } from "@/server/providers/google-books.server";
import { getGameDetails } from "@/server/providers/rawg.server";
import {
  getMovieDetails,
  getSeasonDetails,
  getTVDetails,
} from "@/server/providers/tmdb-api.server";
import { DEPRECATED_MEDIA_MESSAGE, isDeprecatedMediaType } from "@/server/media";
import { Watchlist } from "@/models/watchlist";
import { and, eq, sql } from "drizzle-orm";
import type { AddToWatchlistInput, CreateWatchlistInput, DeleteWatchlistInput } from "./mutations";

const limit = pLimit(5);
const DB_INSERT_CHUNK_SIZE = 50;

type WatchlistMedia = AddToWatchlistInput["media"];
type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};

const getDeprecatedWatchlistAddRejection = (mediaType: string) => {
  if (!isDeprecatedMediaType(mediaType)) {
    return null;
  }

  return {
    success: false,
    message: `${DEPRECATED_MEDIA_MESSAGE} New anime and manga items cannot be added to watchlists.`,
  };
};

async function markLastItemAdded(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

async function addGenericItemToWatchlist(watchlistId: number, media: GenericMedia) {
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

  await markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}

async function addMovieToWatchlist(watchlistId: number, tmdbId: number) {
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

  await markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}

async function addTVShowToWatchlist(watchlistId: number, tmdbId: number, media: WatchlistMedia) {
  const db = getDb();
  const showDetails = await getTVDetails({ data: { id: tmdbId } });
  const seasons = showDetails.seasons || [];

  const allEpisodes = await Promise.all(
    seasons
      .filter((season: { season_number: number }) => season.season_number !== 0)
      .map((season: { season_number: number }) =>
        limit(() =>
          getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
            (seasonDetails) => seasonDetails.episodes,
          ),
        ),
      ),
  ).then((seasonDetails) =>
    seasonDetails.flat().map((episode: any) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb",
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle: media.title,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    })),
  );

  if (allEpisodes.length > 0) {
    for (let i = 0; i < allEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = allEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }

    await markLastItemAdded(watchlistId);
  }

  return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
}

async function addComicToWatchlist(
  watchlistId: number,
  volumeId: string,
  media: WatchlistMedia,
  apiKey: string,
) {
  const db = getDb();
  const existingComicRows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "comic"),
        eq(watchlistItems.source, "comicvine"),
      ),
    );

  const existingIssueIds = new Set(existingComicRows.map((row) => row.tmdbId));
  const issues = await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });

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

  await markLastItemAdded(watchlistId);

  const newIssueCount = watchlistItemsData.length;
  const message =
    existingIssueIds.size > 0
      ? `Added ${newIssueCount} new issues to watchlist`
      : `Added ${newIssueCount} issues to watchlist`;

  return { success: true, message };
}

async function addAnimeToWatchlist(watchlistId: number, aniListId: string, media: WatchlistMedia) {
  const db = getDb();
  const details = await getAnilistDetails(aniListId);

  if (details.episodes && details.episodes > 0) {
    const allEpisodes = Array.from({ length: details.episodes }, (_, index) => ({
      watchlistId,
      tmdbId: `${aniListId}-ep${index + 1}`,
      source: "anilist" as const,
      mediaType: "episode" as const,
      title: `Episode ${index + 1}`,
      parentTitle: media.title,
      season: 1,
      episode: (index + 1).toString(),
      posterPath: details.poster,
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    }));

    for (let i = 0; i < allEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = allEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }

    await markLastItemAdded(watchlistId);

    return { success: true, message: `Added ${allEpisodes.length} episodes to watchlist` };
  }

  return addGenericItemToWatchlist(watchlistId, {
    ...details,
    mediaType: "anime",
  } as GenericMedia);
}

async function addMangaToWatchlist(watchlistId: number, aniListId: string, media: WatchlistMedia) {
  const db = getDb();
  const details = await getAnilistDetails(aniListId);
  const count = details.volumes || details.chapters || 0;
  const label = details.volumes ? "Volume" : "Chapter";

  if (count > 0) {
    const items = Array.from({ length: count }, (_, index) => ({
      watchlistId,
      tmdbId: `${aniListId}-${label.toLowerCase()}${index + 1}`,
      source: "anilist" as const,
      mediaType: "manga" as const,
      title: `${label} ${index + 1}`,
      parentTitle: media.title,
      season: null,
      episode: (index + 1).toString(),
      posterPath: details.poster,
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    }));

    for (let i = 0; i < items.length; i += DB_INSERT_CHUNK_SIZE) {
      const chunk = items.slice(i, i + DB_INSERT_CHUNK_SIZE);
      await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
    }

    await markLastItemAdded(watchlistId);

    return { success: true, message: `Added ${items.length} ${label.toLowerCase()}s to watchlist` };
  }

  return addGenericItemToWatchlist(watchlistId, {
    ...details,
    mediaType: "manga",
  } as GenericMedia);
}

export const WatchlistsWrite = {
  async create(input: CreateWatchlistInput) {
    return Watchlist.create(input);
  },

  async delete({ id }: DeleteWatchlistInput) {
    await Watchlist.destroy(id);
    return { success: true };
  },

  async add({ watchlistId, media }: AddToWatchlistInput) {
    const deprecatedRejection = getDeprecatedWatchlistAddRejection(media.mediaType);
    if (deprecatedRejection) {
      return deprecatedRejection;
    }

    if (media.mediaType === "tv") {
      if (media.source === "tmdb") {
        return addTVShowToWatchlist(watchlistId, Number.parseInt(media.id, 10), media);
      }

      if (media.source !== "custom") {
        throw new Error("TV shows from non-TMDB sources are not supported as generic items");
      }
    }

    if (media.source === "tmdb" && media.mediaType === "movie") {
      return addMovieToWatchlist(watchlistId, Number.parseInt(media.id, 10));
    }

    if (media.source === "comicvine" && media.mediaType === "comic") {
      const apiKey = process.env.COMICVINE_API_KEY;
      if (!apiKey) {
        throw new Error("COMICVINE_API_KEY is not configured");
      }

      return addComicToWatchlist(watchlistId, media.id, media, apiKey);
    }

    if (media.source === "google_books" && media.mediaType === "book") {
      const details = await getBookDetails(media.id);
      return addGenericItemToWatchlist(watchlistId, details);
    }

    if (media.source === "rawg" && media.mediaType === "game") {
      const apiKey = process.env.RAWG_API_KEY;
      if (!apiKey) {
        throw new Error("RAWG_API_KEY is not configured");
      }

      const details = await getGameDetails(media.id, apiKey);
      return addGenericItemToWatchlist(watchlistId, details);
    }

    if (media.source === "anilist") {
      if (media.mediaType === "anime") {
        return addAnimeToWatchlist(watchlistId, media.id, media);
      }

      if (media.mediaType === "manga") {
        return addMangaToWatchlist(watchlistId, media.id, media);
      }
    }

    return addGenericItemToWatchlist(watchlistId, media as GenericMedia);
  },
};
