import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import { buildDetailOrderBy } from "@/features/watchlists/Order.server";
import { reorderItems } from "@/features/watchlists/reorder/Mutation.server";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/Db.server", () => ({
  getDb: () => dbState.db,
}));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
});

afterAll(() => {
  testDb.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("reorderItems mutation", () => {
  it("moves an item relative to an anchor and rewrites changed ranks", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Test Watchlist", itemOrderMode: "custom" })
      .returning();

    const [item1, item2, item3, item4] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "1",
          title: "Item 1",
          mediaType: "movie",
          customRank: 1,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "2",
          title: "Item 2",
          mediaType: "movie",
          customRank: 2,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "3",
          title: "Item 3",
          mediaType: "movie",
          customRank: 3,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "4",
          title: "Item 4",
          mediaType: "movie",
          customRank: 4,
        },
      ])
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist.id,
      movedItemId: item1.id,
      referenceItemId: item3.id,
      position: "after",
    });

    expect(result.success).toBe(true);

    const updatedItems = await db
      .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id))
      .orderBy(watchlistItems.customRank);

    expect(updatedItems).toEqual([
      { id: item2.id, customRank: 1 },
      { id: item3.id, customRank: 2 },
      { id: item1.id, customRank: 3 },
      { id: item4.id, customRank: 4 },
    ]);
  });

  it("fails when the watchlist does not exist", async () => {
    const result = await reorderItems({
      watchlistId: 999_999,
      movedItemId: 1,
      referenceItemId: 2,
      position: "before",
    });

    expect(result).toEqual({
      success: false,
      code: "not_found",
      message: "Watchlist not found.",
    });
  });

  it("fails when the watchlist is not in custom mode", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Release Ordered", itemOrderMode: "release" })
      .returning();

    const [item1, item2] = await db
      .insert(watchlistItems)
      .values([
        { watchlistId: watchlist.id, tmdbId: "1", title: "Item 1", mediaType: "movie" },
        { watchlistId: watchlist.id, tmdbId: "2", title: "Item 2", mediaType: "movie" },
      ])
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist.id,
      movedItemId: item1.id,
      referenceItemId: item2.id,
      position: "before",
    });

    expect(result).toEqual({
      success: false,
      code: "not_custom_mode",
      message: "Reordering is only available in custom mode",
    });
  });

  it("fails when the reference item is outside the watchlist", async () => {
    const [watchlist1] = await db
      .insert(watchlists)
      .values({ name: "Watchlist 1", itemOrderMode: "custom" })
      .returning();
    const [watchlist2] = await db
      .insert(watchlists)
      .values({ name: "Watchlist 2", itemOrderMode: "custom" })
      .returning();

    const [item1] = await db
      .insert(watchlistItems)
      .values({ watchlistId: watchlist1.id, tmdbId: "1", title: "Item 1", mediaType: "movie" })
      .returning();
    const [item2] = await db
      .insert(watchlistItems)
      .values({ watchlistId: watchlist2.id, tmdbId: "2", title: "Item 2", mediaType: "movie" })
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist1.id,
      movedItemId: item1.id,
      referenceItemId: item2.id,
      position: "after",
    });

    expect(result).toEqual({
      success: false,
      code: "invalid_reference",
      message: "Reference item does not belong to this watchlist",
    });
  });

  it("fails when the moved item is outside the watchlist", async () => {
    const [watchlist1] = await db
      .insert(watchlists)
      .values({ name: "Watchlist 1", itemOrderMode: "custom" })
      .returning();
    const [watchlist2] = await db
      .insert(watchlists)
      .values({ name: "Watchlist 2", itemOrderMode: "custom" })
      .returning();

    const [item1] = await db
      .insert(watchlistItems)
      .values({ watchlistId: watchlist1.id, tmdbId: "1", title: "Item 1", mediaType: "movie" })
      .returning();
    const [item2] = await db
      .insert(watchlistItems)
      .values({ watchlistId: watchlist2.id, tmdbId: "2", title: "Item 2", mediaType: "movie" })
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist2.id,
      movedItemId: item1.id,
      referenceItemId: item2.id,
      position: "after",
    });

    expect(result).toEqual({
      success: false,
      code: "invalid_item",
      message: "Moved item does not belong to this watchlist",
    });
  });

  it("fails without mutating ranks when the moved item and reference item are the same", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Self Move", itemOrderMode: "custom" })
      .returning();

    const [item1, item2] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "1",
          title: "Item 1",
          mediaType: "movie",
          customRank: 1,
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "2",
          title: "Item 2",
          mediaType: "movie",
          customRank: 2,
        },
      ])
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist.id,
      movedItemId: item1.id,
      referenceItemId: item1.id,
      position: "before",
    });

    expect(result).toEqual({
      success: false,
      code: "invalid_reorder",
      message: "Moved item and reference item must differ",
    });

    const unchangedItems = await db
      .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id))
      .orderBy(watchlistItems.customRank);

    expect(unchangedItems).toEqual([
      { id: item1.id, customRank: 1 },
      { id: item2.id, customRank: 2 },
    ]);
  });

  it("reorders against the displayed order when ranks are duplicated", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Duplicate Ranks", itemOrderMode: "custom" })
      .returning();

    const [itemA, itemB, itemC, itemD, itemE] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "a",
          title: "A",
          mediaType: "movie",
          customRank: 1,
          releaseDate: "2020-01-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "b",
          title: "B",
          mediaType: "movie",
          customRank: 2,
          releaseDate: "2020-03-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "c",
          title: "C",
          mediaType: "movie",
          customRank: 2,
          releaseDate: "2020-02-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "d",
          title: "D",
          mediaType: "movie",
          customRank: 3,
          releaseDate: "2020-04-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "e",
          title: "E",
          mediaType: "movie",
          customRank: 4,
          releaseDate: "2020-05-01",
        },
      ])
      .returning();

    // The timeline shows A, C, B, D, E: duplicate ranks fall back to release date.
    const result = await reorderItems({
      watchlistId: watchlist.id,
      movedItemId: itemE.id,
      referenceItemId: itemB.id,
      position: "before",
    });

    expect(result.success).toBe(true);
    expect(await readItemsInDisplayOrder(watchlist.id)).toEqual([
      { id: itemA.id, customRank: 1 },
      { id: itemC.id, customRank: 2 },
      { id: itemE.id, customRank: 3 },
      { id: itemB.id, customRank: 4 },
      { id: itemD.id, customRank: 5 },
    ]);
  });

  it("repairs null ranks into a contiguous order", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Null Ranks", itemOrderMode: "custom" })
      .returning();

    const [itemA, itemB, itemC, itemD] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "a",
          title: "A",
          mediaType: "movie",
          customRank: 1,
          releaseDate: "2020-01-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "b",
          title: "B",
          mediaType: "movie",
          customRank: null,
          releaseDate: "2019-01-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "c",
          title: "C",
          mediaType: "movie",
          customRank: null,
          releaseDate: "2018-01-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "d",
          title: "D",
          mediaType: "movie",
          customRank: 2,
          releaseDate: "2020-02-01",
        },
      ])
      .returning();

    // Display order is A, D, C, B: null ranks sort last by release date.
    const result = await reorderItems({
      watchlistId: watchlist.id,
      movedItemId: itemB.id,
      referenceItemId: itemA.id,
      position: "before",
    });

    expect(result.success).toBe(true);
    expect(await readItemsInDisplayOrder(watchlist.id)).toEqual([
      { id: itemB.id, customRank: 1 },
      { id: itemA.id, customRank: 2 },
      { id: itemD.id, customRank: 3 },
      { id: itemC.id, customRank: 4 },
    ]);
  });
});

async function readItemsInDisplayOrder(watchlistId: number) {
  return db
    .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...buildDetailOrderBy("custom"));
}
