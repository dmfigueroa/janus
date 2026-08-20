import * as schema from "@/db/Schema";
import type { IsolatedTestDb } from "@test/IsolatedDb";

type WatchlistValues = typeof schema.watchlists.$inferInsert;
type WatchlistItemValues = typeof schema.watchlistItems.$inferInsert;

export async function createTestWatchlist(
  db: IsolatedTestDb,
  overrides: Partial<WatchlistValues> = {},
) {
  const [watchlist] = await db
    .insert(schema.watchlists)
    .values({ name: "Test Watchlist", ...overrides })
    .returning();

  if (!watchlist) {
    throw new Error("Failed to create test watchlist");
  }

  return watchlist;
}

export async function createTestWatchlistItem(
  db: IsolatedTestDb,
  overrides: Partial<WatchlistItemValues> & Pick<WatchlistItemValues, "watchlistId">,
) {
  const [item] = await db
    .insert(schema.watchlistItems)
    .values({
      tmdbId: "test-item",
      source: "tmdb",
      mediaType: "movie",
      title: "Test Item",
      ...overrides,
    })
    .returning();

  if (!item) {
    throw new Error("Failed to create test watchlist item");
  }

  return item;
}
