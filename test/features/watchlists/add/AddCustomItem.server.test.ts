import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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
let addCustomItemToWatchlist: typeof import("@/features/watchlists/add/AddCustomItem.server").addCustomItemToWatchlist;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  addCustomItemToWatchlist = (await import("@/features/watchlists/add/AddCustomItem.server"))
    .addCustomItemToWatchlist;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(schema.watchlistItems);
  await db.delete(schema.watchlists);
});

describe("custom item addition", () => {
  it("adds a custom item with the supplied title and year", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Custom Picks" });
    const result = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Local Screening",
      mediaType: "movie",
      year: "2025",
    });
    const items = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id));

    expect(result).toEqual({
      success: true,
      code: "added",
      message: "Added to watchlist",
      affectedCount: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "custom",
      mediaType: "movie",
      title: "Local Screening",
      releaseDate: "2025",
    });
  });

  it.each(["movie", "book", "game", "comic"] as const)(
    "adds a custom %s item without a provider call",
    async (mediaType) => {
      const watchlist = await createTestWatchlist(db, { name: "Custom types" });
      const result = await addCustomItemToWatchlist({
        watchlistId: watchlist.id,
        title: "Hand picked",
        mediaType,
      });
      const items = await db
        .select()
        .from(schema.watchlistItems)
        .where(eq(schema.watchlistItems.watchlistId, watchlist.id));

      expect(result).toEqual({
        success: true,
        code: "added",
        message: "Added to watchlist",
        affectedCount: 1,
      });
      expect(items[0]).toMatchObject({ source: "custom", mediaType });
    },
  );

  it("creates a fresh item for a repeated addition of the same title", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Repeat picks" });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Local Screening",
      mediaType: "movie",
      year: "2025",
    });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Local Screening",
      mediaType: "movie",
      year: "2025",
    });
    const items = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id));

    expect(items).toHaveLength(2);
    expect(items[0]?.tmdbId).not.toBe(items[1]?.tmdbId);
  });

  it("requires an insertion position for a custom-ordered watchlist", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Priority Queue",
      itemOrderMode: "custom",
    });

    const result = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Missing Choice",
      mediaType: "movie",
      year: "2025",
    });

    expect(result).toEqual({
      success: false,
      code: "insertion_choice_required",
      message: "Choose where to insert this item in the custom order.",
      affectedCount: 0,
    });
  });

  it("inserts at the beginning of a custom-ordered watchlist when requested", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Priority Queue",
      itemOrderMode: "custom",
    });
    await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "existing-1",
      source: "custom",
      title: "Existing First",
      customRank: 1,
    });

    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Urgent Pick",
      mediaType: "movie",
      year: "2025",
      insertionPosition: "beginning",
    });
    const items = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id))
      .orderBy(schema.watchlistItems.customRank);

    expect(items.map((item) => item.title)).toEqual(["Urgent Pick", "Existing First"]);
  });

  it("returns a not-found failure for a missing watchlist", async () => {
    const result = await addCustomItemToWatchlist({
      watchlistId: 999_999,
      title: "Lost",
      mediaType: "movie",
    });

    expect(result).toEqual({
      success: false,
      code: "not_found",
      message: "Watchlist not found.",
      affectedCount: 0,
    });
  });

  it("rejects custom TV items with the structured message", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Custom TV" });
    const result = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Local Series",
      mediaType: "tv",
      year: "2025",
    });

    expect(result).toEqual({
      success: false,
      code: "unsupported",
      message: "TV shows must come from TMDB so Janus can expand them into episodes.",
      affectedCount: 0,
    });
  });
});
