import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createTestWatchlist,
  createTestWatchlistItem,
} from "@test/features/watchlists/test/WatchlistTestData.server";
import { buildDetailOrderBy } from "@/features/watchlists/Order.server";

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
  it("updates only the provided fields", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Original Name",
      description: "Original desc",
    });

    const result = await updateWatchlistMutation({
      watchlistId: watchlist.id,
      description: "Updated desc",
    });
    const detail = await readWatchlistDetail({ watchlistId: watchlist.id });

    expect(result).toEqual({ success: true });
    expect(detail?.watchlist).toMatchObject({
      name: "Original Name",
      description: "Updated desc",
      itemOrderMode: "release",
    });
  });

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

  it("trims names and rejects whitespace-only names at the schema boundary", async () => {
    const { updateWatchlistSchema } = await import("@/features/watchlists/update/Mutation");

    expect(updateWatchlistSchema.parse({ watchlistId: 1, name: "  Renamed  " })).toEqual({
      watchlistId: 1,
      name: "Renamed",
    });
    expect(updateWatchlistSchema.safeParse({ watchlistId: 1, name: "   " }).success).toBe(false);
  });

  it("initializes contiguous custom ranks in release order when switching release -> custom without saved ranks", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Release List",
      itemOrderMode: "release",
    });
    const datedLater = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "later",
      title: "Later",
      releaseDate: "2022-05-01",
      customRank: null,
    });
    const noDate = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "nodate",
      title: "No Date",
      releaseDate: null,
      customRank: null,
    });
    const tieOne = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "tie-1",
      title: "Tie One",
      releaseDate: "2020-01-02",
      customRank: null,
    });
    const tieTwo = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "tie-2",
      title: "Tie Two",
      releaseDate: "2020-01-02",
      customRank: null,
    });
    const emptyDate = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "empty-date",
      title: "Empty Date",
      releaseDate: "",
      customRank: null,
    });

    const result = await updateWatchlistMutation({
      watchlistId: watchlist.id,
      itemOrderMode: "custom",
    });
    expect(result).toEqual({ success: true });

    const rows = await db
      .select({ id: schema.watchlistItems.id, customRank: schema.watchlistItems.customRank })
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id))
      .orderBy(...buildDetailOrderBy("custom"));

    expect(rows).toEqual([
      { id: tieOne.id, customRank: 1 },
      { id: tieTwo.id, customRank: 2 },
      { id: datedLater.id, customRank: 3 },
      { id: noDate.id, customRank: 4 },
      { id: emptyDate.id, customRank: 5 },
    ]);
  });

  it("preserves existing saved ranks across custom -> release -> custom transitions including unranked additions", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Preserved Ranks",
      itemOrderMode: "custom",
    });
    const first = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "first",
      title: "First",
      releaseDate: "2024-01-01",
      customRank: 2,
    });
    const second = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "second",
      title: "Second",
      releaseDate: "2020-01-01",
      customRank: 1,
    });

    await updateWatchlistMutation({ watchlistId: watchlist.id, itemOrderMode: "release" });
    const addedInRelease = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "added-in-release",
      title: "Added In Release",
      releaseDate: "2019-01-01",
      customRank: null,
    });
    await updateWatchlistMutation({ watchlistId: watchlist.id, itemOrderMode: "custom" });

    const rows = await db
      .select({ id: schema.watchlistItems.id, customRank: schema.watchlistItems.customRank })
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id))
      .orderBy(...buildDetailOrderBy("custom"));

    expect(rows).toEqual([
      { id: second.id, customRank: 1 },
      { id: first.id, customRank: 2 },
      { id: addedInRelease.id, customRank: null },
    ]);
  });

  it("opportunistically repairs legacy all-null custom watchlists and rolls back atomically on failure", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Legacy Custom",
      itemOrderMode: "custom",
    });
    const itemA = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "legacy-a",
      title: "Legacy A",
      releaseDate: "2021-01-01",
      customRank: null,
    });
    const itemB = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "legacy-b",
      title: "Legacy B",
      releaseDate: "2020-01-01",
      customRank: null,
    });

    await updateWatchlistMutation({ watchlistId: watchlist.id, itemOrderMode: "custom" });
    const repaired = await db
      .select({ id: schema.watchlistItems.id, customRank: schema.watchlistItems.customRank })
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id))
      .orderBy(...buildDetailOrderBy("custom"));
    expect(repaired).toEqual([
      { id: itemB.id, customRank: 1 },
      { id: itemA.id, customRank: 2 },
    ]);

    const rollbackList = await createTestWatchlist(db, {
      name: "Rollback List",
      itemOrderMode: "release",
    });
    const blockedItem = await createTestWatchlistItem(db, {
      watchlistId: rollbackList.id,
      tmdbId: "blocked",
      title: "Blocked",
      releaseDate: "2020-01-01",
      customRank: null,
    });

    testDb.sqlite.exec(
      `CREATE TRIGGER reject_custom_rank BEFORE UPDATE OF custom_rank ON watchlist_items WHEN NEW.id = ${blockedItem.id} BEGIN SELECT RAISE(ABORT, 'rank write failed'); END`,
    );
    try {
      await expect(
        updateWatchlistMutation({ watchlistId: rollbackList.id, itemOrderMode: "custom" }),
      ).rejects.toThrow("rank write failed");
    } finally {
      testDb.sqlite.exec("DROP TRIGGER IF EXISTS reject_custom_rank");
    }

    const detail = await readWatchlistDetail({ watchlistId: rollbackList.id });
    expect(detail?.watchlist.itemOrderMode).toBe("release");
    expect(detail?.items[0]?.customRank).toBeNull();
  });
});
