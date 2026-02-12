import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sourceCache = sqliteTable("source_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export type SourceCache = typeof sourceCache.$inferSelect;
export type InsertSourceCache = typeof sourceCache.$inferInsert;
