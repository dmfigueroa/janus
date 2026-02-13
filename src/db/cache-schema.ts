import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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
