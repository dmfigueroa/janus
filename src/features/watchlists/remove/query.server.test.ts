import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@/test/isolated-db";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;
let getWatchlistParentRemovalPreview: typeof import("./query.server").getWatchlistParentRemovalPreview;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;

  ({ getWatchlistParentRemovalPreview } = await import("./query.server"));
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("watchlist parent removal preview", () => {
  it("returns exact count and watched count for the current watchlist parent group", async () => {
    const [watchlist, otherWatchlist] = await db
      .insert(watchlists)
      .values([{ name: "Primary" }, { name: "Secondary" }])
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchlist.id,
        tmdbId: "episode-1",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId: "tmdb:42",
        parentTitle: "Show 42",
        episode: "1",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "episode-2",
        source: "tmdb",
        mediaType: "episode",
        title: "Second",
        parentId: "tmdb:42",
        parentTitle: "Show 42",
        episode: "2",
        releaseDate: "2024-01-02",
        isWatched: false,
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "episode-3",
        source: "tmdb",
        mediaType: "episode",
        title: "Different Show",
        parentId: "tmdb:99",
        parentTitle: "Show 99",
        episode: "1",
        releaseDate: "2024-01-03",
        isWatched: true,
      },
      {
        watchlistId: otherWatchlist.id,
        tmdbId: "episode-4",
        source: "tmdb",
        mediaType: "episode",
        title: "Elsewhere",
        parentId: "tmdb:42",
        parentTitle: "Show 42",
        episode: "3",
        releaseDate: "2024-01-04",
        isWatched: true,
      },
    ]);

    const preview = await getWatchlistParentRemovalPreview({
      watchlistId: watchlist.id,
      parentId: "tmdb:42",
    });

    expect(preview).toEqual({
      count: 2,
      watchedCount: 1,
    });
  });
});
