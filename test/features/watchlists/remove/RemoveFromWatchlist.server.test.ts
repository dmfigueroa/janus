import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/Db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;
let removeWatchlistItemMutation: typeof import("@/features/watchlists/remove/RemoveFromWatchlist.server").removeWatchlistItemMutation;
let removeWatchlistParentMutation: typeof import("@/features/watchlists/remove/RemoveFromWatchlist.server").removeWatchlistParentMutation;
let getWatchlistParentRemovalPreview: typeof import("@/features/watchlists/remove/RemoveFromWatchlist.server").getWatchlistParentRemovalPreview;
let readWatchlistDetailScreen: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;

  const [removeModule, readModule] = await Promise.all([
    import("@/features/watchlists/remove/RemoveFromWatchlist.server"),
    import("@/features/watchlists/Read.server"),
  ]);

  removeWatchlistItemMutation = removeModule.removeWatchlistItemMutation;
  removeWatchlistParentMutation = removeModule.removeWatchlistParentMutation;
  getWatchlistParentRemovalPreview = removeModule.getWatchlistParentRemovalPreview;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("remove watchlist item mutation", () => {
  it("removes one item through the feature write boundary so detail reads reflect the deletion", async () => {
    const [watchlist] = await db.insert(watchlists).values({ name: "Weekend Queue" }).returning();

    const [removedItem] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Remove Me",
        releaseDate: "2024-01-01",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: watchlist.id,
      tmdbId: "movie-2",
      source: "tmdb",
      mediaType: "movie",
      title: "Keep Me",
      releaseDate: "2024-02-01",
      isWatched: false,
    });

    const result = await removeWatchlistItemMutation({
      watchlistId: watchlist.id,
      itemId: removedItem.id,
    });
    const detail = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });

    expect(result).toEqual({
      success: true,
      removedCount: 1,
      message: "Removed item from watchlist.",
    });
    expect(detail?.items.map((item) => item.title)).toEqual(["Keep Me"]);
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
    });
  });

  it("removes a whole parent group only inside the current watchlist and treats stale repeats as success", async () => {
    const [watchlist, otherWatchlist] = await db
      .insert(watchlists)
      .values([{ name: "TV Queue" }, { name: "Other Queue" }])
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
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "Standalone",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
      {
        watchlistId: otherWatchlist.id,
        tmdbId: "episode-3",
        source: "tmdb",
        mediaType: "episode",
        title: "Elsewhere",
        parentId: "tmdb:42",
        parentTitle: "Show 42",
        episode: "3",
        releaseDate: "2024-01-03",
        isWatched: false,
      },
    ]);

    const firstResult = await removeWatchlistParentMutation({
      watchlistId: watchlist.id,
      parentId: "tmdb:42",
    });
    const secondResult = await removeWatchlistParentMutation({
      watchlistId: watchlist.id,
      parentId: "tmdb:42",
    });

    const detail = await readWatchlistDetailScreen({
      watchlistId: watchlist.id,
      unwatchedOnly: false,
    });
    const otherDetail = await readWatchlistDetailScreen({
      watchlistId: otherWatchlist.id,
      unwatchedOnly: false,
    });

    expect(firstResult).toEqual({
      success: true,
      removedCount: 2,
      message: "Removed 2 items from watchlist.",
    });
    expect(secondResult).toEqual({
      success: true,
      removedCount: 0,
      message: "Removed 0 items from watchlist.",
    });
    expect(detail?.items.map((item) => item.title)).toEqual(["Standalone"]);
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 0,
      progress: 0,
    });
    expect(otherDetail?.items.map((item) => item.title)).toEqual(["Elsewhere"]);
  });
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
