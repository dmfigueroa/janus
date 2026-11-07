import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
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
let setWatchedStateMutation: typeof import("@/features/watchlists/lifecycle/WatchlistLifecycle.server").setWatchedStateMutation;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [toggleModule, readModule] = await Promise.all([
    import("@/features/watchlists/lifecycle/WatchlistLifecycle.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  setWatchedStateMutation = toggleModule.setWatchedStateMutation;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("set watched state mutation", () => {
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

    const result = await setWatchedStateMutation({ itemId: item.id, isWatched: true });
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

    const result = await setWatchedStateMutation({
      itemId: item.id,
      isWatched: true,
      updateWatchlistRecency: false,
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id, unwatchedOnly: false });

    expect(result).toEqual({ success: true });
    expect(detail?.watchlist.lastWatchedAt).toBe(originalLastWatchedAt);
  });

  it.each([
    { previous: false, next: true, recency: true, changesRecency: true },
    { previous: true, next: true, recency: true, changesRecency: false },
    { previous: true, next: false, recency: true, changesRecency: false },
    { previous: false, next: false, recency: true, changesRecency: false },
    { previous: false, next: true, recency: false, changesRecency: false },
  ])(
    "sets $previous to $next with recency=$recency",
    async ({ previous, next, recency, changesRecency }) => {
      const originalLastWatchedAt = "2024-01-10 00:00:00";
      const watchlist = await createTestWatchlist(db, { lastWatchedAt: originalLastWatchedAt });
      const item = await createTestWatchlistItem(db, {
        watchlistId: watchlist.id,
        isWatched: previous,
      });

      expect(
        await setWatchedStateMutation({
          itemId: item.id,
          isWatched: next,
          updateWatchlistRecency: recency,
        }),
      ).toEqual({ success: true });
      expect(
        db.select().from(schema.watchlistItems).where(eq(schema.watchlistItems.id, item.id)).get()
          ?.isWatched,
      ).toBe(next);
      const persisted = db
        .select()
        .from(schema.watchlists)
        .where(eq(schema.watchlists.id, watchlist.id))
        .get();
      if (changesRecency) expect(persisted?.lastWatchedAt).not.toBe(originalLastWatchedAt);
      else expect(persisted?.lastWatchedAt).toBe(originalLastWatchedAt);
    },
  );

  it("returns a structured failure for a missing item", async () => {
    expect(await setWatchedStateMutation({ itemId: 999999, isWatched: true })).toEqual({
      success: false,
      message: "Item not found.",
    });
  });

  it("rolls back watched state when the recency write fails", async () => {
    const originalLastWatchedAt = "2024-01-10 00:00:00";
    const watchlist = await createTestWatchlist(db, { lastWatchedAt: originalLastWatchedAt });
    const item = await createTestWatchlistItem(db, { watchlistId: watchlist.id, isWatched: false });
    db.run(
      sql`CREATE TRIGGER reject_watched_recency BEFORE UPDATE OF last_watched_at ON watchlists BEGIN SELECT RAISE(ABORT, 'recency rejected'); END`,
    );
    try {
      await expect(setWatchedStateMutation({ itemId: item.id, isWatched: true })).rejects.toThrow(
        "recency rejected",
      );
      expect(
        db.select().from(schema.watchlistItems).where(eq(schema.watchlistItems.id, item.id)).get()
          ?.isWatched,
      ).toBe(false);
      expect(
        db.select().from(schema.watchlists).where(eq(schema.watchlists.id, watchlist.id)).get()
          ?.lastWatchedAt,
      ).toBe(originalLastWatchedAt);
    } finally {
      db.run(sql`DROP TRIGGER reject_watched_recency`);
    }
  });
});
