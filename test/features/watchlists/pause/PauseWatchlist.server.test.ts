import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { createTestWatchlist } from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let pauseWatchlistMutation: typeof import("@/features/watchlists/pause/Mutation.server").pauseWatchlistMutation;
let resumeWatchlistMutation: typeof import("@/features/watchlists/pause/Mutation.server").resumeWatchlistMutation;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  ({ pauseWatchlistMutation, resumeWatchlistMutation } =
    await import("@/features/watchlists/pause/Mutation.server"));
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("pause watchlist mutation", () => {
  it("returns a structured not-found result", async () => {
    await expect(pauseWatchlistMutation({ watchlistId: 999_999 })).resolves.toEqual({
      success: false,
      message: "Watchlist not found.",
    });
  });

  it("stamps the paused timestamp on an unpaused watchlist", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Pause me" });

    await expect(pauseWatchlistMutation({ watchlistId: watchlist.id })).resolves.toEqual({
      success: true,
    });
    const [pausedWatchlist] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));
    expect(pausedWatchlist?.pausedAt).not.toBeNull();
  });

  it("keeps the recency timestamp untouched", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Pause me",
      lastWatchedAt: "2000-01-01 00:00:00",
    });

    await pauseWatchlistMutation({ watchlistId: watchlist.id });

    const [pausedWatchlist] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));
    expect(pausedWatchlist?.lastWatchedAt).toBe("2000-01-01 00:00:00");
  });
});

describe("resume watchlist mutation", () => {
  it("returns a structured not-found result", async () => {
    await expect(resumeWatchlistMutation({ watchlistId: 999_999 })).resolves.toEqual({
      success: false,
      message: "Watchlist not found.",
    });
  });

  it("clears the paused timestamp of a paused watchlist", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Resume me",
      pausedAt: "2024-06-01 00:00:00",
    });

    await expect(resumeWatchlistMutation({ watchlistId: watchlist.id })).resolves.toEqual({
      success: true,
    });
    const [resumedWatchlist] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));
    expect(resumedWatchlist?.pausedAt).toBeNull();
  });

  it("keeps the recency timestamp untouched", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Resume me",
      lastWatchedAt: "2000-01-01 00:00:00",
      pausedAt: "2024-06-01 00:00:00",
    });

    await resumeWatchlistMutation({ watchlistId: watchlist.id });

    const [resumedWatchlist] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));
    expect(resumedWatchlist?.lastWatchedAt).toBe("2000-01-01 00:00:00");
  });
});
