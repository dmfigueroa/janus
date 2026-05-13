import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@/test/isolated-db";
import { reorderItems } from "./mutation.server";

const dbState = vi.hoisted(() => ({
  db: undefined as IsolatedTestDb | undefined,
}));

vi.mock("@/db/db.server", () => ({
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
  it("updates custom ranks for all provided items in the specified order", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Test Watchlist", itemOrderMode: "custom" })
      .returning();

    const [item1, item2, item3] = await db
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
      ])
      .returning();

    // Reorder: 3, 1, 2
    const result = await reorderItems({
      watchlistId: watchlist.id,
      itemIds: [item3.id, item1.id, item2.id],
    });

    expect(result.success).toBe(true);

    const updatedItems = await db
      .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id))
      .orderBy(watchlistItems.customRank);

    expect(updatedItems).toEqual([
      { id: item3.id, customRank: 1 },
      { id: item1.id, customRank: 2 },
      { id: item2.id, customRank: 3 },
    ]);
  });

  it("fails if any item does not belong to the watchlist", async () => {
    const [watchlist1] = await db.insert(watchlists).values({ name: "Watchlist 1" }).returning();
    const [watchlist2] = await db.insert(watchlists).values({ name: "Watchlist 2" }).returning();

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
      itemIds: [item1.id, item2.id],
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("do not belong to this watchlist");
  });

  it("fails without changing ranks when the submitted order omits watchlist items", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Full List Required", itemOrderMode: "custom" })
      .returning();

    const [item1, item2, item3] = await db
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
      ])
      .returning();

    const result = await reorderItems({
      watchlistId: watchlist.id,
      itemIds: [item2.id, item1.id],
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("full unfiltered watchlist");

    const unchangedItems = await db
      .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id))
      .orderBy(watchlistItems.customRank);

    expect(unchangedItems).toEqual([
      { id: item1.id, customRank: 1 },
      { id: item2.id, customRank: 2 },
      { id: item3.id, customRank: 3 },
    ]);
  });
});
