import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const watchlists = sqliteTable("watchlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  lastWatchedAt: text("last_watched_at"),
  lastItemAddedAt: text("last_item_added_at"),
});

export type Watchlist = typeof watchlists.$inferSelect;
export type InsertWatchlist = typeof watchlists.$inferInsert;

export const watchlistImportJobs = sqliteTable(
  "watchlist_import_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sidequestJobId: integer("sidequest_job_id").notNull(),
    watchlistId: integer("watchlist_id")
      .references(() => watchlists.id, { onDelete: "cascade" })
      .notNull(),
    mediaType: text("media_type").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed"],
    })
      .notNull()
      .default("queued"),
    totalItems: integer("total_items").notNull().default(0),
    processedItems: integer("processed_items").notNull().default(0),
    insertedItems: integer("inserted_items").notNull().default(0),
    message: text("message"),
    error: text("error"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),
  },
  (table) => ({
    bySidequestJobId: uniqueIndex("watchlist_import_jobs_sidequest_job_id").on(
      table.sidequestJobId,
    ),
    byWatchlistCreatedAt: index("watchlist_import_jobs_watchlist_created_at").on(
      table.watchlistId,
      table.createdAt,
    ),
  }),
);

export type WatchlistImportJob = typeof watchlistImportJobs.$inferSelect;
export type InsertWatchlistImportJob = typeof watchlistImportJobs.$inferInsert;

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    watchlistId: integer("watchlist_id")
      .references(() => watchlists.id, { onDelete: "cascade" })
      .notNull(),
    tmdbId: text("tmdb_id").notNull(), // Stores external ID (TMDB, ISBN, etc.)
    source: text("source").notNull().default("tmdb"),
    mediaType: text("media_type", {
      enum: ["movie", "episode", "game", "book", "comic", "anime", "manga"], // Expanded enum
    }).notNull(),
    title: text("title").notNull(),
    parentTitle: text("parent_title"), // For TV Show name
    season: integer("season"),
    episode: text("episode"),
    posterPath: text("poster_path"),
    releaseDate: text("release_date"),
    voteAverage: real("vote_average"),
    runtime: integer("runtime"), // In minutes
    isWatched: integer("is_watched", { mode: "boolean" }).default(false),
    addedAt: text("added_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),
  },
  (table) => ({
    uniqueWatchlistItem: uniqueIndex("unique_watchlist_item").on(
      table.watchlistId,
      table.tmdbId,
      table.mediaType,
    ),
    byWatchlistReleaseDate: index("by_watchlist_release_date").on(
      table.watchlistId,
      table.releaseDate,
    ),
  }),
);

export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type InsertWatchlistItem = typeof watchlistItems.$inferInsert;
