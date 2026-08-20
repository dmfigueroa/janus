import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let deleteWatchlistMutation: typeof import("@/features/watchlists/delete/Mutation.server").deleteWatchlistMutation;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;
let listWatchlists: typeof import("@/features/watchlists/Read.server").WatchlistsRead.listScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [deleteModule, readModule] = await Promise.all([
    import("@/features/watchlists/delete/Mutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  deleteWatchlistMutation = deleteModule.deleteWatchlistMutation;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
  listWatchlists = readModule.WatchlistsRead.listScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("delete watchlist mutation", () => {
  it("removes a watchlist and its items from read flows", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Archive",
      description: "Ready to remove",
    });
    await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "movie-1",
      source: "tmdb",
      mediaType: "movie",
      title: "Gone Soon",
      releaseDate: "2024-01-01",
    });

    await deleteWatchlistMutation({ id: watchlist.id });

    await expect(listWatchlists()).resolves.toEqual([]);
    await expect(readWatchlistDetail({ watchlistId: watchlist.id })).resolves.toBeNull();
  });
});
