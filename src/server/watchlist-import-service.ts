import { and, eq, sql } from "drizzle-orm";
import { watchlistItems, watchlists } from "../db/schema";
import { getTVDetails, getSeasonDetails, getMovieDetails } from "./providers/tmdb.server";
import { getComicIssues } from "./providers/comicvine.server";
import { getBookDetails } from "./providers/google-books.server";
import { getGameDetails } from "./providers/rawg.server";
import { getAnilistDetails } from "./providers/anilist.server";
import { getDb } from "../db/db.server";
import { type WatchlistImportMedia } from "./watchlist-import-types";

const DB_INSERT_CHUNK_SIZE = 50;

type GenericMedia = Omit<WatchlistImportMedia, "mediaType"> & {
  mediaType: Exclude<WatchlistImportMedia["mediaType"], "tv">;
};

type ProgressUpdate = {
  totalItems: number;
  processedItems: number;
  insertedItems: number;
  message: string;
};

type ProgressCallback = (update: ProgressUpdate) => Promise<void> | void;

export type ImportExecutionResult = {
  totalItems: number;
  processedItems: number;
  insertedItems: number;
  message: string;
};

class ImportProgressTracker {
  private state: ProgressUpdate = {
    totalItems: 0,
    processedItems: 0,
    insertedItems: 0,
    message: "Preparing import",
  };

  constructor(private readonly onProgress?: ProgressCallback) {}

  async setTotal(totalItems: number, unitLabel: string) {
    this.state.totalItems = totalItems;
    this.state.message = this.buildMessage(unitLabel);
    await this.publish();
  }

  async increaseTotal(additionalTotal: number, unitLabel: string) {
    this.state.totalItems += additionalTotal;
    this.state.message = this.buildMessage(unitLabel);
    await this.publish();
  }

  async bump(processedDelta: number, insertedDelta: number, unitLabel: string) {
    this.state.processedItems += processedDelta;
    this.state.insertedItems += insertedDelta;

    if (this.state.processedItems > this.state.totalItems) {
      this.state.totalItems = this.state.processedItems;
    }

    this.state.message = this.buildMessage(unitLabel);
    await this.publish();
  }

  snapshot() {
    return this.state;
  }

  private buildMessage(unitLabel: string) {
    return `${this.state.insertedItems} of ${this.state.totalItems} ${unitLabel} added`;
  }

  private async publish() {
    if (!this.onProgress) return;
    await this.onProgress(this.state);
  }
}

export async function processWatchlistImport(
  watchlistId: number,
  media: WatchlistImportMedia,
  onProgress?: ProgressCallback,
): Promise<ImportExecutionResult> {
  const tracker = new ImportProgressTracker(onProgress);

  if (media.mediaType === "tv") {
    if (media.source === "tmdb") {
      const tmdbId = parseInt(media.id, 10);
      return await addTVShowImport(watchlistId, tmdbId, media, tracker);
    }
    if (media.source !== "custom") {
      throw new Error("TV shows from non-TMDB sources are not supported as generic items");
    }
  }

  if (media.source === "tmdb" && media.mediaType === "movie") {
    const tmdbId = parseInt(media.id, 10);
    return await addMovieImport(watchlistId, tmdbId, tracker);
  }

  if (media.source === "comicvine" && media.mediaType === "comic") {
    const cvApiKey = process.env.COMICVINE_API_KEY;
    if (!cvApiKey) throw new Error("COMICVINE_API_KEY is not configured");
    return await addComicImport(watchlistId, media.id, media, cvApiKey, tracker);
  }

  if (media.source === "google_books" && media.mediaType === "book") {
    const details = await getBookDetails(media.id);
    return await addGenericImport(watchlistId, details as GenericMedia, tracker);
  }

  if (media.source === "rawg" && media.mediaType === "game") {
    const rawgApiKey = process.env.RAWG_API_KEY;
    if (!rawgApiKey) throw new Error("RAWG_API_KEY is not configured");
    const details = await getGameDetails(media.id, rawgApiKey);
    return await addGenericImport(watchlistId, details as GenericMedia, tracker);
  }

  if (media.source === "anilist") {
    if (media.mediaType === "anime") {
      return await addAnimeImport(watchlistId, media.id, media, tracker);
    }
    if (media.mediaType === "manga") {
      return await addMangaImport(watchlistId, media.id, media, tracker);
    }
  }

  return await addGenericImport(watchlistId, media as GenericMedia, tracker);
}

async function addGenericImport(
  watchlistId: number,
  media: GenericMedia,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
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
    return {
      ...tracker.snapshot(),
      message: "Already in watchlist",
    };
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

  await touchWatchlistLastAdded(watchlistId);
  await tracker.bump(1, 1, "items");

  return {
    ...tracker.snapshot(),
    message: "Added to watchlist",
  };
}

async function addMovieImport(
  watchlistId: number,
  tmdbId: number,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
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
    return {
      ...tracker.snapshot(),
      message: "Already in watchlist",
    };
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

  await touchWatchlistLastAdded(watchlistId);
  await tracker.bump(1, 1, "items");

  return {
    ...tracker.snapshot(),
    message: "Added to watchlist",
  };
}

async function addTVShowImport(
  watchlistId: number,
  tmdbId: number,
  media: WatchlistImportMedia,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
  const showDetails = await getTVDetails({ data: { id: tmdbId } });
  const seasons = (showDetails.seasons || []).filter((season: any) => season.season_number !== 0);
  const estimatedEpisodes = seasons.reduce((sum: number, season: any) => {
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

    const episodeRows = episodes.map((episode: any) => ({
      watchlistId,
      tmdbId: episode.id.toString(),
      source: "tmdb" as const,
      mediaType: "episode" as const,
      title: episode.name,
      parentTitle: media.title,
      season: episode.season_number,
      episode: episode.episode_number.toString(),
      posterPath: episode.still_path || showDetails.poster_path,
      releaseDate: episode.air_date,
      voteAverage: episode.vote_average,
      runtime: episode.runtime || 0,
    }));

    await insertRowsInChunks(episodeRows, async (chunkSize, insertedCount) => {
      await tracker.bump(chunkSize, insertedCount, "episodes");
    });
  }

  if (tracker.snapshot().insertedItems > 0) {
    await touchWatchlistLastAdded(watchlistId);
  }

  return {
    ...tracker.snapshot(),
    message: `Added ${tracker.snapshot().insertedItems} episodes to watchlist`,
  };
}

async function addComicImport(
  watchlistId: number,
  volumeId: string,
  media: WatchlistImportMedia,
  apiKey: string,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
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

  await tracker.setTotal(issues.length, "issues");

  if (issues.length === 0) {
    const message =
      existingIssueIds.size > 0
        ? "No new issues found for this volume"
        : "No issues found for this volume";
    return {
      ...tracker.snapshot(),
      message,
    };
  }

  const rows = issues.map((issue) => ({
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

  await insertRowsInChunks(rows, async (chunkSize, insertedCount) => {
    await tracker.bump(chunkSize, insertedCount, "issues");
  });

  if (tracker.snapshot().insertedItems > 0) {
    await touchWatchlistLastAdded(watchlistId);
  }

  const insertedIssues = tracker.snapshot().insertedItems;
  return {
    ...tracker.snapshot(),
    message:
      existingIssueIds.size > 0
        ? `Added ${insertedIssues} new issues to watchlist`
        : `Added ${insertedIssues} issues to watchlist`,
  };
}

async function addAnimeImport(
  watchlistId: number,
  aniListId: string,
  media: WatchlistImportMedia,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
  const details = await getAnilistDetails(aniListId);
  const episodesCount = details.episodes || 0;

  if (episodesCount <= 0) {
    return await addGenericImport(
      watchlistId,
      {
        ...details,
        mediaType: "anime",
      } as GenericMedia,
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
      parentTitle: media.title,
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
    await touchWatchlistLastAdded(watchlistId);
  }

  return {
    ...tracker.snapshot(),
    message: `Added ${tracker.snapshot().insertedItems} episodes to watchlist`,
  };
}

async function addMangaImport(
  watchlistId: number,
  aniListId: string,
  media: WatchlistImportMedia,
  tracker: ImportProgressTracker,
): Promise<ImportExecutionResult> {
  const details = await getAnilistDetails(aniListId);
  const count = details.volumes || details.chapters || 0;
  const itemLabel = details.volumes ? "volumes" : "chapters";

  if (count <= 0) {
    return await addGenericImport(
      watchlistId,
      {
        ...details,
        mediaType: "manga",
      } as GenericMedia,
      tracker,
    );
  }

  await tracker.setTotal(count, itemLabel);

  let pendingRows: Array<typeof watchlistItems.$inferInsert> = [];

  for (let itemNumber = 1; itemNumber <= count; itemNumber += 1) {
    pendingRows.push({
      watchlistId,
      tmdbId: `${aniListId}-${itemLabel === "volumes" ? "volume" : "chapter"}${itemNumber}`,
      source: "anilist",
      mediaType: "manga",
      title: `${itemLabel === "volumes" ? "Volume" : "Chapter"} ${itemNumber}`,
      parentTitle: media.title,
      season: null,
      episode: itemNumber.toString(),
      posterPath: details.poster,
      releaseDate: details.releaseDate,
      voteAverage: details.rating || 0,
      runtime: 0,
    });

    if (pendingRows.length >= DB_INSERT_CHUNK_SIZE) {
      const insertedCount = await insertChunk(pendingRows);
      await tracker.bump(pendingRows.length, insertedCount, itemLabel);
      pendingRows = [];
    }
  }

  if (pendingRows.length > 0) {
    const insertedCount = await insertChunk(pendingRows);
    await tracker.bump(pendingRows.length, insertedCount, itemLabel);
  }

  if (tracker.snapshot().insertedItems > 0) {
    await touchWatchlistLastAdded(watchlistId);
  }

  return {
    ...tracker.snapshot(),
    message: `Added ${tracker.snapshot().insertedItems} ${itemLabel} to watchlist`,
  };
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

async function touchWatchlistLastAdded(watchlistId: number) {
  const db = getDb();
  await db
    .update(watchlists)
    .set({ lastItemAddedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(watchlists.id, watchlistId));
}
