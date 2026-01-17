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
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type", { enum: ["movie", "episode"] }).notNull(),
    title: text("title").notNull(),
    parentTitle: text("parent_title"), // For TV Show name
    season: integer("season"),
    episode: integer("episode"),
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
    uniqueWatchlistItem: uniqueIndex("unique_watchlist_item").on(table.watchlistId, table.tmdbId),
  }),
);

export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type InsertWatchlistItem = typeof watchlistItems.$inferInsert;
