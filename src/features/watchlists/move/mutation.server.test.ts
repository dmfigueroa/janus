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
let moveItemToWatchlistMutation: typeof import("./mutation.server").moveItemToWatchlistMutation;
let readWatchlistDetailScreen: typeof import("../read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;

  const [moveModule, readModule] = await Promise.all([
    import("./mutation.server"),
    import("../read.server"),
  ]);

  moveItemToWatchlistMutation = moveModule.moveItemToWatchlistMutation;
  readWatchlistDetailScreen = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("move watchlist item mutation", () => {
  it("blocks move to destination that already has the item — returns error, source unchanged, destination unchanged", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const [movedItem] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
        releaseDate: "1999-03-30",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: destination.id,
      tmdbId: "movie-1",
      source: "tmdb",
      mediaType: "movie",
      title: "The Matrix",
      releaseDate: "1999-03-30",
      isWatched: false,
    });

    const result = await moveItemToWatchlistMutation({
      itemId: movedItem.id,
      destinationWatchlistId: destination.id,
    });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("already");
    expect(sourceDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
    expect(destDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
  });

  it("moves single item from source to destination — item present in destination, absent from source, stats updated on both", async () => {
    const [source, destination] = await db
      .insert(watchlists)
      .values([{ name: "Queue" }, { name: "Watched" }])
      .returning();

    const [movedItem] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: source.id,
        tmdbId: "movie-1",
        source: "tmdb",
        mediaType: "movie",
        title: "The Matrix",
        releaseDate: "1999-03-30",
        isWatched: true,
      })
      .returning();

    await db.insert(watchlistItems).values({
      watchlistId: source.id,
      tmdbId: "movie-2",
      source: "tmdb",
      mediaType: "movie",
      title: "Keep Me",
      releaseDate: "2024-01-01",
      isWatched: false,
    });

    const result = await moveItemToWatchlistMutation({
      itemId: movedItem.id,
      destinationWatchlistId: destination.id,
    });

    const sourceDetail = await readWatchlistDetailScreen({
      watchlistId: source.id,
      unwatchedOnly: false,
    });
    const destDetail = await readWatchlistDetailScreen({
      watchlistId: destination.id,
      unwatchedOnly: false,
    });

    expect(result).toEqual({
      success: true,
      movedCount: 1,
      message: expect.stringContaining("The Matrix"),
    });
    expect(sourceDetail?.items.map((item) => item.title)).toEqual(["Keep Me"]);
    expect(sourceDetail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 0,
    });
    expect(destDetail?.items.map((item) => item.title)).toEqual(["The Matrix"]);
    expect(destDetail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 1,
    });
  });
});
