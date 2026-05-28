import type { watchlistItems } from "@/db/schema";

export type PersistedWatchlistItem = Pick<
  typeof watchlistItems.$inferSelect,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;

export type PendingWatchlistItem = typeof watchlistItems.$inferInsert;

export type PendingWatchlistItemWithIndex = PendingWatchlistItem & {
  pendingIndex: number;
};

export type OrderedWatchlistItem = PersistedWatchlistItem | PendingWatchlistItemWithIndex;
