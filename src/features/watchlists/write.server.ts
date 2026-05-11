import pLimit from "p-limit";
import { getDb } from "@/db/db.server";
import { watchlistItems, watchlists } from "@/db/schema";
import { getComicIssues } from "@/server/providers/comicvine.server";
import { getBookDetails } from "@/server/providers/google-books.server";
import { getGameDetails } from "@/server/providers/rawg.server";
import {
  getMovieDetails,
  getSeasonDetails,
  getTVDetails,
} from "@/server/providers/tmdb-api.server";
import { getDeprecatedWatchlistAddRejection, type WatchlistAddRejection } from "@/server/media";
import { Watchlist } from "@/models/watchlist";
import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  AddToWatchlistInput,
  CreateWatchlistInput,
  DeleteWatchlistInput,
  MergeWatchlistsInput,
  ToggleWatchedInput,
  UpdateWatchlistItemOrderModeInput,
} from "./mutations";

const limit = pLimit(5);
const DB_INSERT_CHUNK_SIZE = 50;
const CUSTOM_ORDER_MERGE_UNSUPPORTED_MESSAGE =
  "Merging custom-ordered watchlists is not supported yet.";
const UNSUPPORTED_TV_SOURCE_MESSAGE =
  "TV shows must come from TMDB so Janus can expand them into episodes.";
const COMICVINE_UNAVAILABLE_MESSAGE =
  "Comic additions are unavailable because the ComicVine integration is not configured.";
const RAWG_UNAVAILABLE_MESSAGE =
  "Game additions are unavailable because the RAWG integration is not configured.";
const TMDB_MOVIE_FETCH_FAILURE_MESSAGE = "Failed to fetch movie details from TMDB.";
const TMDB_TV_FETCH_FAILURE_MESSAGE = "Failed to fetch TV details from TMDB.";
const COMICVINE_FETCH_FAILURE_MESSAGE = "Failed to fetch comic issues from ComicVine.";
const GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE = "Failed to fetch book details from Google Books.";
const RAWG_FETCH_FAILURE_MESSAGE = "Failed to fetch game details from RAWG.";

type WatchlistMedia = AddToWatchlistInput["media"];
type GenericMedia = Omit<WatchlistMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistMedia["mediaType"], "tv">;
};
type WatchlistDb = ReturnType<typeof getDb>;
type WatchlistTransaction = Parameters<Parameters<WatchlistDb["transaction"]>[0]>[0];
type WatchlistWriteResult = { success: true; message: string } | WatchlistAddRejection;
type MergeWatchlistsResult =
  | { success: true; targetId: number }
  | { success: false; message: string };
type TMDBEpisode = {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  still_path: string | null;
  air_date?: string;
  vote_average: number;
  runtime?: number | null;
};

const formatCount = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const rejectAdd = (message: string): WatchlistAddRejection => ({
  success: false,
  message,
});

function assertMergeHasSources(sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    throw new Error("At least one source watchlist must be selected");
  }
}

async function hasCustomOrderMergeParticipant({
  targetWatchlistId,
  sourceWatchlistIds,
}: Pick<MergeWatchlistsInput, "targetWatchlistId" | "sourceWatchlistIds">) {
  const participantIds = Array.from(
    new Set(targetWatchlistId ? [...sourceWatchlistIds, targetWatchlistId] : sourceWatchlistIds),
  );

  const db = getDb();
  const [customOrderParticipant] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(inArray(watchlists.id, participantIds), eq(watchlists.itemOrderMode, "custom")))
    .limit(1);

  return customOrderParticipant !== undefined;
}

async function markLastItemAdded(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}

async function addGenericItemToWatchlist(
  watchlistId: number,
  media: GenericMedia,
): Promise<WatchlistWriteResult> {
  const db = getDb();
  const [inserted] = await db
    .insert(watchlistItems)
    .values({
      watchlistId,
      tmdbId: media.id,
      source: media.source,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.poster,
      releaseDate: media.releaseDate || media.year,
      voteAverage: media.rating,
      runtime: 0,
    })
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}

async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
): Promise<WatchlistWriteResult> {
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

  let details: Awaited<ReturnType<typeof getMovieDetails>>;
  try {
    details = await getMovieDetails({ data: { id: tmdbId } });
  } catch {
    return rejectAdd(TMDB_MOVIE_FETCH_FAILURE_MESSAGE);
  }

  const [inserted] = await db
    .insert(watchlistItems)
    .values({
      watchlistId,
      tmdbId: tmdbId.toString(),
      source: "tmdb",
      mediaType: "movie",
      title: details.title || details.name || "Unknown",
      posterPath: details.poster_path,
      releaseDate: details.release_date,
      voteAverage: details.vote_average,
      runtime: details.runtime || 0,
    })
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id });

  if (!inserted) {
    return { success: true, message: "Already in watchlist" };
  }

  await markLastItemAdded(watchlistId);

  return { success: true, message: "Added to watchlist" };
}

async function addTVShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistMedia,
): Promise<WatchlistWriteResult> {
  const db = getDb();
  let showDetails: Awaited<ReturnType<typeof getTVDetails>>;
  let allEpisodes: Array<{
    watchlistId: number;
    tmdbId: string;
    source: "tmdb";
    mediaType: "episode";
    title: string;
    parentTitle: string;
    season: number;
    episode: string;
    posterPath: string | null;
    releaseDate: string | undefined;
    voteAverage: number;
    runtime: number;
  }>;

  try {
    showDetails = await getTVDetails({ data: { id: tmdbId } });
    const showTitle = showDetails.name || media.title;
    const seasons = showDetails.seasons || [];
    const seasonEpisodeLists = await Promise.all(
      seasons
        .filter((season: { season_number: number }) => season.season_number !== 0)
        .map((season: { season_number: number }) =>
          limit(() =>
            getSeasonDetails({ data: { id: tmdbId, seasonNumber: season.season_number } }).then(
              (seasonDetails: { episodes: TMDBEpisode[] }) => seasonDetails.episodes,
            ),
          ),
        ),
    );

    allEpisodes = seasonEpisodeLists.flat().map((episode) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle: showTitle,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    }));
  } catch {
    return rejectAdd(TMDB_TV_FETCH_FAILURE_MESSAGE);
  }

  if (allEpisodes.length === 0) {
    return { success: true, message: "No episodes found for this show" };
  }

  const existingEpisodeRows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "episode"),
        eq(watchlistItems.source, "tmdb"),
      ),
    );
  const existingEpisodeIds = new Set(existingEpisodeRows.map((row) => row.tmdbId));
  const newEpisodes = allEpisodes.filter((episode) => !existingEpisodeIds.has(episode.tmdbId));

  if (newEpisodes.length === 0) {
    return { success: true, message: "No new episodes found for this show" };
  }

  for (let i = 0; i < newEpisodes.length; i += DB_INSERT_CHUNK_SIZE) {
    const chunk = newEpisodes.slice(i, i + DB_INSERT_CHUNK_SIZE);
    await db.insert(watchlistItems).values(chunk).onConflictDoNothing();
  }

  await markLastItemAdded(watchlistId);

  return {
    success: true,
    message: `Added ${formatCount(newEpisodes.length, "new episode", "new episodes")} to watchlist`,
  };
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
  let issues: Awaited<ReturnType<typeof getComicIssues>>;
  try {
    issues = await getComicIssues(volumeId, apiKey, { knownIssueIds: existingIssueIds });
  } catch {
    return rejectAdd(COMICVINE_FETCH_FAILURE_MESSAGE);
  }

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

function createMergedWatchlist(transaction: WatchlistTransaction, name: string) {
  const [newWatchlist] = transaction
    .insert(watchlists)
    .values({
      name,
      description: "Merged watchlist",
    })
    .returning()
    .all();

  return newWatchlist.id;
}

function resolveMergeTarget(
  transaction: WatchlistTransaction,
  {
    targetWatchlistId,
    newWatchlistName,
  }: Pick<MergeWatchlistsInput, "targetWatchlistId" | "newWatchlistName">,
) {
  const targetId =
    targetWatchlistId ??
    (newWatchlistName ? createMergedWatchlist(transaction, newWatchlistName) : null);

  if (!targetId) {
    throw new Error("Target watchlist ID resolution failed");
  }

  return targetId;
}

function sourceIdsToMove(sourceWatchlistIds: number[], targetId: number) {
  return sourceWatchlistIds.filter((id) => id !== targetId);
}

function mergeSourceItemsIntoTarget(
  transaction: WatchlistTransaction,
  sourceWatchlistIds: number[],
  targetId: number,
) {
  if (sourceWatchlistIds.length === 0) {
    return false;
  }

  const result = transaction
    .insert(watchlistItems)
    .select(
      transaction
        .select({
          id: sql<number | null>`NULL`.as("id"),
          watchlistId: sql<number>`${targetId}`.as("watchlistId"),
          tmdbId: watchlistItems.tmdbId,
          source: watchlistItems.source,
          mediaType: watchlistItems.mediaType,
          title: watchlistItems.title,
          parentTitle: watchlistItems.parentTitle,
          season: watchlistItems.season,
          episode: watchlistItems.episode,
          posterPath: watchlistItems.posterPath,
          releaseDate: watchlistItems.releaseDate,
          voteAverage: watchlistItems.voteAverage,
          runtime: watchlistItems.runtime,
          customRank: sql<number | null>`NULL`.as("customRank"),
          isWatched: watchlistItems.isWatched,
          addedAt: watchlistItems.addedAt,
        })
        .from(watchlistItems)
        .where(inArray(watchlistItems.watchlistId, sourceWatchlistIds)),
    )
    .onConflictDoUpdate({
      target: [watchlistItems.watchlistId, watchlistItems.tmdbId, watchlistItems.mediaType],
      set: {
        isWatched: sql`MAX(${watchlistItems.isWatched}, excluded.is_watched)`,
      },
    })
    .run();

  return result.changes > 0;
}

function markLastItemAddedInTransaction(transaction: WatchlistTransaction, watchlistId: number) {
  transaction
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId))
    .run();
}

function deleteMergedSources(transaction: WatchlistTransaction, sourceWatchlistIds: number[]) {
  if (sourceWatchlistIds.length === 0) {
    return;
  }

  transaction.delete(watchlists).where(inArray(watchlists.id, sourceWatchlistIds)).run();
}

export const WatchlistsWrite = {
  async create(input: CreateWatchlistInput) {
    return Watchlist.create(input);
  },

  async delete({ id }: DeleteWatchlistInput) {
    await Watchlist.destroy(id);
    return { success: true };
  },

  async merge({
    targetWatchlistId,
    sourceWatchlistIds,
    newWatchlistName,
  }: MergeWatchlistsInput): Promise<MergeWatchlistsResult> {
    assertMergeHasSources(sourceWatchlistIds);

    if (await hasCustomOrderMergeParticipant({ targetWatchlistId, sourceWatchlistIds })) {
      return { success: false, message: CUSTOM_ORDER_MERGE_UNSUPPORTED_MESSAGE };
    }

    const db = getDb();
    return db.transaction((transaction) => {
      const targetId = resolveMergeTarget(transaction, { targetWatchlistId, newWatchlistName });
      const sourceIds = sourceIdsToMove(sourceWatchlistIds, targetId);
      const mergedItems = mergeSourceItemsIntoTarget(transaction, sourceIds, targetId);

      if (mergedItems) {
        markLastItemAddedInTransaction(transaction, targetId);
      }

      deleteMergedSources(transaction, sourceIds);

      return { success: true, targetId };
    });
  },

  async add({ watchlistId, media }: AddToWatchlistInput) {
    const deprecatedRejection = getDeprecatedWatchlistAddRejection(media.mediaType);
    if (deprecatedRejection) {
      return deprecatedRejection;
    }

    if (media.mediaType === "tv") {
      if (media.source !== "tmdb") {
        return rejectAdd(UNSUPPORTED_TV_SOURCE_MESSAGE);
      }

      return addTVShowToWatchlist(watchlistId, Number.parseInt(media.id, 10), media);
    }

    if (media.source === "tmdb" && media.mediaType === "movie") {
      return addMovieToWatchlist(watchlistId, Number.parseInt(media.id, 10));
    }

    if (media.source === "comicvine" && media.mediaType === "comic") {
      const apiKey = process.env.COMICVINE_API_KEY;
      if (!apiKey) {
        return rejectAdd(COMICVINE_UNAVAILABLE_MESSAGE);
      }

      return addComicToWatchlist(watchlistId, media.id, media, apiKey);
    }

    if (media.source === "google_books" && media.mediaType === "book") {
      let details: Awaited<ReturnType<typeof getBookDetails>>;
      try {
        details = await getBookDetails(media.id);
      } catch {
        return rejectAdd(GOOGLE_BOOKS_FETCH_FAILURE_MESSAGE);
      }
      return addGenericItemToWatchlist(watchlistId, details);
    }

    if (media.source === "rawg" && media.mediaType === "game") {
      const apiKey = process.env.RAWG_API_KEY;
      if (!apiKey) {
        return rejectAdd(RAWG_UNAVAILABLE_MESSAGE);
      }

      let details: Awaited<ReturnType<typeof getGameDetails>>;
      try {
        details = await getGameDetails(media.id, apiKey);
      } catch {
        return rejectAdd(RAWG_FETCH_FAILURE_MESSAGE);
      }
      return addGenericItemToWatchlist(watchlistId, details);
    }

    return addGenericItemToWatchlist(watchlistId, media as GenericMedia);
  },

  async toggleWatched({ itemId, isWatched }: ToggleWatchedInput) {
    const db = getDb();
    const [item] = await db
      .select({ watchlistId: watchlistItems.watchlistId })
      .from(watchlistItems)
      .where(eq(watchlistItems.id, itemId));

    await db.update(watchlistItems).set({ isWatched }).where(eq(watchlistItems.id, itemId));

    if (item && isWatched) {
      await db
        .update(watchlists)
        .set({ lastWatchedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(watchlists.id, item.watchlistId));
    }

    return { success: true };
  },

  async updateItemOrderMode({ watchlistId, itemOrderMode }: UpdateWatchlistItemOrderModeInput) {
    const db = getDb();

    await db.update(watchlists).set({ itemOrderMode }).where(eq(watchlists.id, watchlistId));

    return { success: true };
  },
};
