import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { createTestWatchlist } from "@test/features/watchlists/test/WatchlistTestData.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
let updateWatchlistMutation: typeof import("@/features/watchlists/update/Mutation.server").updateWatchlistMutation;
let readWatchlistDetail: typeof import("@/features/watchlists/Read.server").WatchlistsRead.detailScreen;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  const [updateModule, readModule] = await Promise.all([
    import("@/features/watchlists/update/Mutation.server"),
    import("@/features/watchlists/Read.server"),
  ]);
  updateWatchlistMutation = updateModule.updateWatchlistMutation;
  readWatchlistDetail = readModule.WatchlistsRead.detailScreen;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("update watchlist mutation", () => {
  it("updates name, description, and item order mode", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Original Name",
      description: "Original desc",
    });

    const result = await updateWatchlistMutation({
      watchlistId: watchlist.id,
      name: "Updated Name",
      description: "Updated desc",
      itemOrderMode: "custom",
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true });
    expect(detail?.watchlist).toMatchObject({
      name: "Updated Name",
      description: "Updated desc",
      itemOrderMode: "custom",
    });
  });

  it("clears a description when an empty string is passed", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Named List",
      description: "Will be cleared",
    });

    const result = await updateWatchlistMutation({
      watchlistId: watchlist.id,
      name: "Named List",
      description: "",
      itemOrderMode: "release",
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true });
    expect(detail?.watchlist.description).toBeNull();
  });

  it("returns a structured failure for a missing watchlist", async () => {
    await expect(
      updateWatchlistMutation({
        watchlistId: 999_999,
        name: "Ghost List",
        description: null,
        itemOrderMode: "release",
      }),
    ).resolves.toEqual({ success: false, message: "Watchlist not found." });
  });
});
