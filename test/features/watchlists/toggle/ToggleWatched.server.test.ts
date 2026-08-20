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
let toggleWatchedMutation: typeof import("@/features/watchlists/toggle/Mutation.server").toggleWatchedMutation;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [toggleModule, readModule] = await Promise.all([
    import("@/features/watchlists/toggle/Mutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  toggleWatchedMutation = toggleModule.toggleWatchedMutation;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("toggle watched mutation", () => {
  it("persists watched state and updates detail progress", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Toggle Flow" });
    const item = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "toggle-me",
      source: "tmdb",
      mediaType: "movie",
      title: "Toggle Me",
      releaseDate: "2024-01-01",
    });

    const result = await toggleWatchedMutation({ itemId: item.id, isWatched: true });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id, unwatchedOnly: false });

    expect(result).toEqual({ success: true });
    expect(detail?.items[0]).toMatchObject({ id: item.id, isWatched: true });
    expect(detail?.watchlist.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 1,
      progress: 100,
    });
  });

  it("can preserve watchlist recency when requested", async () => {
    const originalLastWatchedAt = "2024-01-10 00:00:00";
    const watchlist = await createTestWatchlist(db, {
      name: "Quiet Toggle",
      lastWatchedAt: originalLastWatchedAt,
    });
    const item = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "quiet-toggle",
      source: "tmdb",
      mediaType: "movie",
      title: "Quiet Toggle",
      releaseDate: "2024-01-01",
    });

    const result = await toggleWatchedMutation({
      itemId: item.id,
      isWatched: true,
      updateWatchlistRecency: false,
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id, unwatchedOnly: false });

    expect(result).toEqual({ success: true });
    expect(detail?.watchlist.lastWatchedAt).toBe(originalLastWatchedAt);
  });
});
