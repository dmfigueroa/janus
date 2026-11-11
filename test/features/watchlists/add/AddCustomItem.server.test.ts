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

  it("persists a supplied release date", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Dated picks" });
    const result = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Full Date Pick",
      mediaType: "movie",
      releaseDate: "2025-02-03",
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
    expect(items[0]).toMatchObject({
      source: "custom",
      mediaType: "movie",
      title: "Full Date Pick",
      releaseDate: "2025-02-03",
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

  it("uses distinct parent identities for custom series with similar titles", async () => {
    const watchlist = await createTestWatchlist(db, { name: "Custom episodes" });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      mediaType: "episode",
      parentTitle: "A B",
      title: "First",
      episode: "S01E01",
    });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      mediaType: "episode",
      parentTitle: "A-B",
      title: "First",
      episode: "S01E01",
    });
    const items = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id));

    expect(items.map((item) => item.parentId)).toEqual(["custom:a%20b", "custom:a-b"]);
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

  it("inserts at beginning, end, before, and after in a custom-ordered watchlist", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Priority Queue",
      itemOrderMode: "custom",
    });
    const firstExisting = await createTestWatchlistItem(db, {
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
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Before Existing",
      mediaType: "movie",
      year: "2025",
      insertionPosition: "before",
      referenceItemId: firstExisting.id,
    });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "After Existing",
      mediaType: "movie",
      year: "2025",
      insertionPosition: "after",
      referenceItemId: firstExisting.id,
    });
    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Tail Pick",
      mediaType: "movie",
      year: "2025",
      insertionPosition: "end",
    });

    const items = await db
      .select()
      .from(schema.watchlistItems)
      .where(eq(schema.watchlistItems.watchlistId, watchlist.id))
      .orderBy(schema.watchlistItems.customRank);

    expect(items.map((item) => [item.title, item.customRank])).toEqual([
      ["Urgent Pick", 1],
      ["Before Existing", 2],
      ["Existing First", 3],
      ["After Existing", 4],
      ["Tail Pick", 5],
    ]);
  });

  it("rejects anchored insertion on a release-ordered watchlist with not_custom_mode", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Release Ordered",
      itemOrderMode: "release",
    });
    const existing = await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "existing-1",
      source: "custom",
      title: "Existing",
    });

    const result = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Anchored Custom",
      mediaType: "movie",
      insertionPosition: "before",
      referenceItemId: existing.id,
    });

    expect(result).toEqual({
      success: false,
      code: "not_custom_mode",
      message: "Anchored insertion is only available in custom mode.",
      affectedCount: 0,
    });
  });

  it("rejects anchored insertion with a missing or unknown reference item with invalid_reference", async () => {
    const watchlist = await createTestWatchlist(db, {
      name: "Custom Queue",
      itemOrderMode: "custom",
    });
    await createTestWatchlistItem(db, {
      watchlistId: watchlist.id,
      tmdbId: "existing-1",
      source: "custom",
      title: "Existing",
      customRank: 1,
    });

    const missingRefResult = await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "No Ref",
      mediaType: "movie",
      insertionPosition: "after",
      referenceItemId: 999_999,
    });

    expect(missingRefResult).toEqual({
      success: false,
      code: "invalid_reference",
      message: "Reference item 999999 is not in this watchlist.",
      affectedCount: 0,
    });
  });

  it("updates lastItemAddedAt while preserving rotation timestamps (lastWatchedAt and pausedAt)", async () => {
    const lastWatchedAt = "2025-01-01T12:00:00.000Z";
    const pausedAt = "2025-01-02T12:00:00.000Z";
    const watchlist = await createTestWatchlist(db, {
      name: "Rotation Preserved",
      lastWatchedAt,
      pausedAt,
    });

    await addCustomItemToWatchlist({
      watchlistId: watchlist.id,
      title: "Fresh Addition",
      mediaType: "movie",
    });

    const [updated] = await db
      .select()
      .from(schema.watchlists)
      .where(eq(schema.watchlists.id, watchlist.id));

    expect(updated?.lastWatchedAt).toBe(lastWatchedAt);
    expect(updated?.pausedAt).toBe(pausedAt);
    expect(updated?.lastItemAddedAt).toEqual(expect.any(String));
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

describe("custom item schema validation", () => {
  const baseInput = { watchlistId: 1, title: "Pick", mediaType: "movie" };

  it("accepts a year-only or complete calendar release date and an omitted date", async () => {
    const { customItemAdditionSchema } = await import("@/features/watchlists/add/AddCustomItem");

    expect(customItemAdditionSchema.safeParse({ ...baseInput, year: "2025" }).success).toBe(true);
    expect(customItemAdditionSchema.safeParse({ ...baseInput, year: "2025-02-03" }).success).toBe(
      true,
    );
    expect(
      customItemAdditionSchema.safeParse({ ...baseInput, releaseDate: "2025-02-03" }).success,
    ).toBe(true);
    expect(customItemAdditionSchema.safeParse(baseInput).success).toBe(true);
  });

  it("rejects malformed and impossible dates", async () => {
    const { customItemAdditionSchema } = await import("@/features/watchlists/add/AddCustomItem");

    expect(customItemAdditionSchema.safeParse({ ...baseInput, year: "20x5" }).success).toBe(false);
    expect(customItemAdditionSchema.safeParse({ ...baseInput, year: "2025-02-29" }).success).toBe(
      false,
    );
  });

  it("requires series metadata for custom episodes", async () => {
    const { customItemAdditionSchema } = await import("@/features/watchlists/add/AddCustomItem");

    expect(customItemAdditionSchema.safeParse({ ...baseInput, mediaType: "episode" }).success).toBe(
      false,
    );
  });
});
