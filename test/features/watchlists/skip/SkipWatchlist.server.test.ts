import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { createTestWatchlist } from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let skipWatchlistMutation: typeof import("@/features/watchlists/lifecycle/WatchlistLifecycle.server").skipWatchlistMutation;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  ({ skipWatchlistMutation } =
    await import("@/features/watchlists/lifecycle/WatchlistLifecycle.server"));
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("skip watchlist mutation", () => {
  it("returns a structured not-found result", async () => {
    await expect(skipWatchlistMutation({ watchlistId: 999_999 })).resolves.toEqual({
      success: false,
      message: "Watchlist not found.",
    });
  });

  it("updates the watchlist recency", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Skip me",
      lastWatchedAt: "2000-01-01 00:00:00",
    });

    await expect(skipWatchlistMutation({ watchlistId: watchlist.id })).resolves.toEqual({
      success: true,
    });
    const [skippedWatchlist] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));
    expect(skippedWatchlist?.lastWatchedAt).not.toBe("2000-01-01 00:00:00");
  });
});
