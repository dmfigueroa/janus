import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
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
      enum: ["movie", "episode", "game", "book", "comic"], // Expanded enum
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
  }),
);

export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type InsertWatchlistItem = typeof watchlistItems.$inferInsert;

export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: text("created_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  expiresAt: text("expires_at").notNull(),
});

export type ApiCache = typeof apiCache.$inferSelect;
export type InsertApiCache = typeof apiCache.$inferInsert;
