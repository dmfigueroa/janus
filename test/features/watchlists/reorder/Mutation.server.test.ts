import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
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
  it("moves an item relative to an anchor and rewrites only the affected rank slice", async () => {
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
      message: "Reordering is only available in custom mode",
    });
  });

  it("fails when either moved or reference item is outside the watchlist", async () => {
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
      message: "Some items do not belong to this watchlist",
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
});
