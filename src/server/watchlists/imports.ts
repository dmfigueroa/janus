"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { watchlistImportJobs, watchlistItems, watchlists } from "../../db/schema";
import { getDb } from "../../db/db.server";
import { getAnilistDetails } from "../providers/anilist.server";
import { getComicIssues } from "../providers/comicvine.server";
import { getBookDetails } from "../providers/google-books.server";
import { getGameDetails } from "../providers/rawg.server";
import {
  getMovieDetails,
  getSeasonDetails,
  getTVDetails,
  type TMDBEpisode,
  type TMDBSeason,
} from "../providers/tmdb.server";
import { getErrorMessage } from "../utils";
import { type CreateImportInput, type ImportMedia } from "./import/contracts";

export { createImportSchema } from "./import/contracts";

const DB_INSERT_CHUNK_SIZE = 50;

type GenericImportMedia = Omit<ImportMedia, "mediaType"> & {
  mediaType: Exclude<ImportMedia["mediaType"], "tv">;
};

export type WatchlistImportStatus = {
  jobId: number;
  status: "queued" | "running" | "completed" | "failed";
  totalItems: number;
  processedItems: number;
  insertedItems: number;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type ImportProgress = {
  totalItems: number;
  processedItems: number;
  insertedItems: number;
  message: string;
};

type ImportCompletionReason = "items_added";
type ImportNoopReason = "already_in_watchlist" | "no_items_found" | "no_new_items_found";

export type ImportResult =
  | (ImportProgress & {
      kind: "completed";
      reason: ImportCompletionReason;
    })
  | (ImportProgress & {
      kind: "noop";
      reason: ImportNoopReason;
    });

type ImportPlan =
  | { kind: "tmdb_tv"; tmdbId: number }
  | { kind: "tmdb_movie"; tmdbId: number }
  | { kind: "comicvine_comic"; volumeId: string; apiKey: string }
  | { kind: "google_books_book"; bookId: string }
  | { kind: "rawg_game"; gameId: string; apiKey: string }
  | { kind: "anilist_anime"; aniListId: string }
  | { kind: "anilist_manga"; aniListId: string }
  | { kind: "generic"; media: GenericImportMedia };

type ImportUnit = "items" | "episodes" | "issues" | "volumes" | "chapters";

type ImportStateTransition =
  | {
      status: "running";
      startedAt: ReturnType<typeof sql>;
    }
  | {
      status: "completed";
      message?: string;
      completedAt: ReturnType<typeof sql>;
    }
  | {
      status: "failed";
      error: string;
      completedAt: ReturnType<typeof sql>;
    };

type ProgressListener = (progress: ImportProgress) => Promise<void> | void;

class ImportProgressTracker {
  private state: ImportProgress = {
    totalItems: 0,
    processedItems: 0,
    insertedItems: 0,
    message: "Preparing import",
  };

  constructor(private readonly onProgress?: ProgressListener) {}

  async setTotal(totalItems: number, unit: ImportUnit) {
    this.state.totalItems = totalItems;
    this.state.message = this.buildMessage(unit);
    await this.publish();
  }

  async increaseTotal(additionalTotal: number, unit: ImportUnit) {
    this.state.totalItems += additionalTotal;
    this.state.message = this.buildMessage(unit);
    await this.publish();
  }

  async bump(processedDelta: number, insertedDelta: number, unit: ImportUnit) {
    this.state.processedItems += processedDelta;
    this.state.insertedItems += insertedDelta;

    if (this.state.processedItems > this.state.totalItems) {
      this.state.totalItems = this.state.processedItems;
    }

    this.state.message = this.buildMessage(unit);
    await this.publish();
  }

  snapshot() {
    return this.state;
  }

  private buildMessage(unit: ImportUnit) {
    return `${this.state.insertedItems} of ${this.state.totalItems} ${unit} added`;
  }

  private async publish() {
    if (!this.onProgress) {
      return;
    }

    await this.onProgress(this.state);
  }
}

export async function createImport(input: {
  jobId: number;
  watchlistId: number;
  mediaType: string;
  source: string;
  title: string;
  totalItems: number;
}) {
  const db = getDb();
  const [record] = await db
    .insert(watchlistImportJobs)
    .values({
      sidequestJobId: input.jobId,
      watchlistId: input.watchlistId,
      mediaType: input.mediaType,
      source: input.source,
      title: input.title,
      status: "queued",
      totalItems: input.totalItems,
      processedItems: 0,
      insertedItems: 0,
    })
    .returning();

  return record;
}

export async function updateImportProgress(
  jobId: number,
  progress: {
    totalItems?: number;
    processedItems: number;
    insertedItems: number;
    message?: string;
  },
) {
  const db = getDb();
  await db
    .update(watchlistImportJobs)
    .set({
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      insertedItems: progress.insertedItems,
      message: progress.message,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(watchlistImportJobs.sidequestJobId, jobId));
}

export async function markImportRunning(jobId: number) {
  return updateImportState(jobId, {
    status: "running",
    startedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function markImportCompleted(jobId: number, message?: string) {
  return updateImportState(jobId, {
    status: "completed",
    message,
    completedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function markImportFailed(jobId: number, error: string) {
  return updateImportState(jobId, {
    status: "failed",
    error,
    completedAt: sql`CURRENT_TIMESTAMP`,
  });
}

export async function getImportByJobId(jobId: number): Promise<WatchlistImportStatus | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(watchlistImportJobs)
    .where(eq(watchlistImportJobs.sidequestJobId, jobId))
    .limit(1);

  if (!record) {
    return null;
  }

  return {
    jobId,
    status: record.status,
    totalItems: record.totalItems,
    processedItems: record.processedItems,
    insertedItems: record.insertedItems,
    message: record.message,
    error: record.error,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
  };
}

export async function getLatestImportForWatchlist(watchlistId: number) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(watchlistImportJobs)
    .where(and(eq(watchlistImportJobs.watchlistId, watchlistId)))
    .orderBy(desc(watchlistImportJobs.createdAt))
    .limit(1);

  return record || null;
}

export async function runImport(jobId: number, input: CreateImportInput): Promise<ImportResult> {
  await markImportRunning(jobId);

  try {
    const result = await importIntoWatchlist(input.watchlistId, input.media, async (progress) => {
      await updateImportProgress(jobId, progress);
    });

    await markImportCompleted(jobId, result.message);
    return result;
  } catch (error) {
    const message = logImportError(jobId, input, error);
    await markImportFailed(jobId, message);
    throw error;
  }
}

async function updateImportState(jobId: number, transition: ImportStateTransition) {
  const db = getDb();
  const stateUpdate =
    transition.status === "running"
      ? {
          status: transition.status,
          message: undefined,
          error: undefined,
          startedAt: transition.startedAt,
          completedAt: undefined,
        }
      : transition.status === "completed"
        ? {
            status: transition.status,
            message: transition.message,
            error: undefined,
            completedAt: transition.completedAt,
          }
        : {
            status: transition.status,
            message: undefined,
            error: transition.error,
            completedAt: transition.completedAt,
          };

  await db
    .update(watchlistImportJobs)
    .set({
      ...stateUpdate,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(watchlistImportJobs.sidequestJobId, jobId));
}

function logImportError(jobId: number, input: CreateImportInput, error: unknown) {
  const message = getErrorMessage(error);
  const suffix = error instanceof Error && error.stack ? `\n${error.stack}` : "";

  console.error(`[watchlists/imports] run failed for job ${jobId}: ${message}${suffix}`, {
    watchlistId: input.watchlistId,
    media: {
      id: input.media.id,
      mediaType: input.media.mediaType,
      source: input.media.source,
      title: input.media.title,
    },
  });

  return message;
}

function isGenericImportMedia(media: ImportMedia): media is GenericImportMedia {
  return media.mediaType !== "tv";
}

function parseNumericMediaId(mediaId: string, source: ImportMedia["source"]) {
  const parsed = Number.parseInt(mediaId, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${source} media id: ${mediaId}`);
  }

  return parsed;
}

function getRequiredProviderApiKey(
  envVar: "TMDB_API_KEY" | "COMICVINE_API_KEY" | "RAWG_API_KEY",
  watchlistId: number,
  media: ImportMedia,
) {
  const apiKey = process.env[envVar];
  if (apiKey) {
    return apiKey;
  }

  console.error(`[watchlists/imports] ${envVar} is not configured`, {
    watchlistId,
    mediaId: media.id,
    mediaType: media.mediaType,
    source: media.source,
    title: media.title,
  });

  throw new Error(`${envVar} is not configured`);
}

function buildImportPlan(watchlistId: number, media: ImportMedia): ImportPlan {
  if (media.mediaType === "tv") {
    if (media.source === "tmdb") {
      return {
        kind: "tmdb_tv",
        tmdbId: parseNumericMediaId(media.id, media.source),
      };
    }

    if (media.source !== "custom") {
      console.error("[watchlists/imports] unsupported TV source for generic import", {
        watchlistId,
        mediaId: media.id,
        source: media.source,
        mediaType: media.mediaType,
        title: media.title,
      });
      throw new Error("TV shows from non-TMDB sources are not supported as generic items");
    }
  }

  if (media.source === "tmdb" && media.mediaType === "movie") {
    getRequiredProviderApiKey("TMDB_API_KEY", watchlistId, media);
    return {
      kind: "tmdb_movie",
      tmdbId: parseNumericMediaId(media.id, media.source),
    };
  }

  if (media.source === "comicvine" && media.mediaType === "comic") {
    return {
      kind: "comicvine_comic",
      volumeId: media.id,
      apiKey: getRequiredProviderApiKey("COMICVINE_API_KEY", watchlistId, media),
    };
  }

  if (media.source === "google_books" && media.mediaType === "book") {
    return {
      kind: "google_books_book",
      bookId: media.id,
    };
  }

  if (media.source === "rawg" && media.mediaType === "game") {
    return {
      kind: "rawg_game",
      gameId: media.id,
      apiKey: getRequiredProviderApiKey("RAWG_API_KEY", watchlistId, media),
    };
  }

  if (media.source === "anilist" && media.mediaType === "anime") {
    return {
      kind: "anilist_anime",
      aniListId: media.id,
    };
  }

  if (media.source === "anilist" && media.mediaType === "manga") {
    return {
      kind: "anilist_manga",
      aniListId: media.id,
    };
  }

  if (!isGenericImportMedia(media)) {
    throw new Error(`Unsupported generic import media type: ${media.mediaType}`);
  }

  return {
    kind: "generic",
    media,
  };
}

function importCompleted(tracker: ImportProgressTracker, message: string): ImportResult {
  return {
    kind: "completed",
    reason: "items_added",
    ...tracker.snapshot(),
    message,
  };
}

function importNoop(
  tracker: ImportProgressTracker,
  reason: ImportNoopReason,
  message: string,
): ImportResult {
  return {
    kind: "noop",
    reason,
    ...tracker.snapshot(),
    message,
  };
}

async function importIntoWatchlist(
  watchlistId: number,
  media: ImportMedia,
  onProgress?: ProgressListener,
): Promise<ImportResult> {
  const tracker = new ImportProgressTracker(onProgress);
  const plan = buildImportPlan(watchlistId, media);

  switch (plan.kind) {
    case "tmdb_tv":
      return addTvShowToWatchlist(watchlistId, plan.tmdbId, media.title, tracker);
    case "tmdb_movie":
      return addMovieToWatchlist(watchlistId, plan.tmdbId, tracker);
    case "comicvine_comic":
      return addComicVolumeToWatchlist(
        watchlistId,
        plan.volumeId,
        media.title,
        plan.apiKey,
        tracker,
      );
    case "google_books_book":
      return addGenericMediaToWatchlist(
        watchlistId,
        {
          ...(await getBookDetails(plan.bookId)),
          mediaType: "book",
        },
        tracker,
      );
    case "rawg_game":
      return addGenericMediaToWatchlist(
        watchlistId,
        {
          ...(await getGameDetails(plan.gameId, plan.apiKey)),
          mediaType: "game",
        },
        tracker,
      );
    case "anilist_anime":
      return addAnimeToWatchlist(watchlistId, plan.aniListId, media.title, tracker);
    case "anilist_manga":
      return addMangaToWatchlist(watchlistId, plan.aniListId, media.title, tracker);
    case "generic":
      return addGenericMediaToWatchlist(watchlistId, plan.media, tracker);
  }
}

async function addGenericMediaToWatchlist(
  watchlistId: number,
  media: GenericImportMedia,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const db = getDb();
  await tracker.setTotal(1, "items");

  const existing = await db
    .select({ id: watchlistItems.id })
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
    await tracker.bump(1, 0, "items");
    return importNoop(tracker, "already_in_watchlist", "Already in watchlist");
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

  await markWatchlistUpdatedAfterImport(watchlistId);
  await tracker.bump(1, 1, "items");

  return importCompleted(tracker, "Added to watchlist");
}

async function addMovieToWatchlist(
  watchlistId: number,
  tmdbId: number,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const db = getDb();
  await tracker.setTotal(1, "items");

  const existing = await db
    .select({ id: watchlistItems.id })
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
    await tracker.bump(1, 0, "items");
    return importNoop(tracker, "already_in_watchlist", "Already in watchlist");
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

  await markWatchlistUpdatedAfterImport(watchlistId);
  await tracker.bump(1, 1, "items");

  return importCompleted(tracker, "Added to watchlist");
}

async function addTvShowToWatchlist(
  watchlistId: number,
  tmdbId: number,
  parentTitle: string,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const showDetails = await getTVDetails({ data: { id: tmdbId } });
  const seasons = (showDetails.seasons || []).filter(
    (season: TMDBSeason) => season.season_number !== 0,
  );
  const estimatedEpisodes = seasons.reduce((sum: number, season: TMDBSeason) => {
    return sum + (season.episode_count || 0);
  }, 0);

  await tracker.setTotal(estimatedEpisodes, "episodes");

  for (const season of seasons) {
    const seasonDetails = await getSeasonDetails({
      data: { id: tmdbId, seasonNumber: season.season_number },
    });

    const episodes = seasonDetails.episodes || [];
    if (estimatedEpisodes === 0 && episodes.length > 0) {
      await tracker.increaseTotal(episodes.length, "episodes");
    }

    const rows = episodes.map((episode: TMDBEpisode) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    }));

    await insertRowsInChunks(rows, async (chunkSize, insertedCount) => {
      await tracker.bump(chunkSize, insertedCount, "episodes");
    });
  }

  if (tracker.snapshot().insertedItems > 0) {
    await markWatchlistUpdatedAfterImport(watchlistId);
  }

  return importCompleted(
    tracker,
    `Added ${tracker.snapshot().insertedItems} episodes to watchlist`,
  );
}

async function addComicVolumeToWatchlist(
  watchlistId: number,
  volumeId: string,
  parentTitle: string,
  apiKey: string,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const db = getDb();
  const existingRows = await db
    .select({ tmdbId: watchlistItems.tmdbId })
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, "comic"),
        eq(watchlistItems.source, "comicvine"),
      ),
    );

  const knownIssueIds = new Set(existingRows.map((row) => row.tmdbId));
  const issues = await getComicIssues(volumeId, apiKey, { knownIssueIds });

  await tracker.setTotal(issues.length, "issues");

  if (issues.length === 0) {
    return knownIssueIds.size > 0
      ? importNoop(tracker, "no_new_items_found", "No new issues found for this volume")
      : importNoop(tracker, "no_items_found", "No issues found for this volume");
  }

  const rows = issues.map((issue) => ({
    watchlistId,
    tmdbId: issue.id,
    source: "comicvine" as const,
    mediaType: "comic" as const,
    title: issue.title,
    parentTitle,
    season: null,
    episode: issue.issueNumber,
    posterPath: issue.poster,
    releaseDate: issue.coverDate,
    voteAverage: 0,
    runtime: 0,
  }));

  await insertRowsInChunks(rows, async (chunkSize, insertedCount) => {
    await tracker.bump(chunkSize, insertedCount, "issues");
  });

  if (tracker.snapshot().insertedItems > 0) {
    await markWatchlistUpdatedAfterImport(watchlistId);
  }

  const insertedIssues = tracker.snapshot().insertedItems;
  return importCompleted(
    tracker,
    knownIssueIds.size > 0
      ? `Added ${insertedIssues} new issues to watchlist`
      : `Added ${insertedIssues} issues to watchlist`,
  );
}

async function addAnimeToWatchlist(
  watchlistId: number,
  aniListId: string,
  parentTitle: string,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const details = await getAnilistDetails(aniListId);
  const episodesCount = details.episodes || 0;

  if (episodesCount <= 0) {
    return addGenericMediaToWatchlist(
      watchlistId,
      {
        ...details,
        mediaType: "anime",
      },
      tracker,
    );
  }

  await tracker.setTotal(episodesCount, "episodes");

  let pendingRows: Array<typeof watchlistItems.$inferInsert> = [];
  for (let episodeNumber = 1; episodeNumber <= episodesCount; episodeNumber += 1) {
    pendingRows.push({
      watchlistId,
      tmdbId: `${aniListId}-ep${episodeNumber}`,
      source: "anilist",
      mediaType: "episode",
      title: `Episode ${episodeNumber}`,
      parentTitle,
      season: 1,
      episode: episodeNumber.toString(),
      posterPath: details.poster,
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    });

    if (pendingRows.length >= DB_INSERT_CHUNK_SIZE) {
      const insertedCount = await insertChunk(pendingRows);
      await tracker.bump(pendingRows.length, insertedCount, "episodes");
      pendingRows = [];
    }
  }

  if (pendingRows.length > 0) {
    const insertedCount = await insertChunk(pendingRows);
    await tracker.bump(pendingRows.length, insertedCount, "episodes");
  }

  if (tracker.snapshot().insertedItems > 0) {
    await markWatchlistUpdatedAfterImport(watchlistId);
  }

  return importCompleted(
    tracker,
    `Added ${tracker.snapshot().insertedItems} episodes to watchlist`,
  );
}

async function addMangaToWatchlist(
  watchlistId: number,
  aniListId: string,
  parentTitle: string,
  tracker: ImportProgressTracker,
): Promise<ImportResult> {
  const details = await getAnilistDetails(aniListId);
  const count = details.volumes || details.chapters || 0;
  const unit: Extract<ImportUnit, "volumes" | "chapters"> = details.volumes
    ? "volumes"
    : "chapters";

  if (count <= 0) {
    return addGenericMediaToWatchlist(
      watchlistId,
      {
        ...details,
        mediaType: "manga",
      },
      tracker,
    );
  }

  await tracker.setTotal(count, unit);

  let pendingRows: Array<typeof watchlistItems.$inferInsert> = [];
  for (let itemNumber = 1; itemNumber <= count; itemNumber += 1) {
    const itemPrefix = unit === "volumes" ? "volume" : "chapter";
    const itemTitle = unit === "volumes" ? "Volume" : "Chapter";

    pendingRows.push({
      watchlistId,
      tmdbId: `${aniListId}-${itemPrefix}${itemNumber}`,
      source: "anilist",
      mediaType: "manga",
      title: `${itemTitle} ${itemNumber}`,
      parentTitle,
      season: null,
      episode: itemNumber.toString(),
      posterPath: details.poster,
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    });

    if (pendingRows.length >= DB_INSERT_CHUNK_SIZE) {
      const insertedCount = await insertChunk(pendingRows);
      await tracker.bump(pendingRows.length, insertedCount, unit);
      pendingRows = [];
    }
  }

  if (pendingRows.length > 0) {
    const insertedCount = await insertChunk(pendingRows);
    await tracker.bump(pendingRows.length, insertedCount, unit);
  }

  if (tracker.snapshot().insertedItems > 0) {
    await markWatchlistUpdatedAfterImport(watchlistId);
  }

  return importCompleted(tracker, `Added ${tracker.snapshot().insertedItems} ${unit} to watchlist`);
}

async function insertRowsInChunks(
  rows: Array<typeof watchlistItems.$inferInsert>,
  onChunkInserted: (chunkSize: number, insertedCount: number) => Promise<void>,
) {
  for (let index = 0; index < rows.length; index += DB_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + DB_INSERT_CHUNK_SIZE);
    const insertedCount = await insertChunk(chunk);
    await onChunkInserted(chunk.length, insertedCount);
  }
}

async function insertChunk(rows: Array<typeof watchlistItems.$inferInsert>) {
  if (rows.length === 0) {
    return 0;
  }

  const db = getDb();
  const inserted = await db
    .insert(watchlistItems)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id });

  return inserted.length;
}

async function markWatchlistUpdatedAfterImport(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}
