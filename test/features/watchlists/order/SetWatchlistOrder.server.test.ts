import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createWatchlistOrderToken,
  getWatchlistOrderState,
  setWatchlistOrder,
} from "@/features/watchlists/order/SetWatchlistOrder.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));
vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("setWatchlistOrder", () => {
  it("sets every item's rank in the requested order", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Ordered", itemOrderMode: "custom" })
      .returning();
    const items = await db
      .insert(watchlistItems)
      .values([
        { watchlistId: watchlist.id, tmdbId: "1", title: "One", mediaType: "movie", customRank: 1 },
        { watchlistId: watchlist.id, tmdbId: "2", title: "Two", mediaType: "movie", customRank: 2 },
        {
          watchlistId: watchlist.id,
          tmdbId: "3",
          title: "Three",
          mediaType: "movie",
          customRank: 3,
        },
      ])
      .returning();

    const result = await setWatchlistOrder({
      watchlistId: watchlist.id,
      orderedItemIds: [items[2].id, items[0].id, items[1].id],
    });

    expect(result).toEqual({
      success: true,
      orderToken: createWatchlistOrderToken(watchlist.id, [items[2].id, items[0].id, items[1].id]),
    });
    const updatedItems = await db
      .select({ id: watchlistItems.id, customRank: watchlistItems.customRank })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlist.id))
      .orderBy(watchlistItems.customRank);
    expect(updatedItems).toEqual([
      { id: items[2].id, customRank: 1 },
      { id: items[0].id, customRank: 2 },
      { id: items[1].id, customRank: 3 },
    ]);
  });

  it("changes the token when effective order changes through release dates", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Unranked", itemOrderMode: "custom" })
      .returning();
    const [firstItem, secondItem] = await db
      .insert(watchlistItems)
      .values([
        {
          watchlistId: watchlist.id,
          tmdbId: "1",
          title: "One",
          mediaType: "movie",
          releaseDate: "2025-02-01",
        },
        {
          watchlistId: watchlist.id,
          tmdbId: "2",
          title: "Two",
          mediaType: "movie",
          releaseDate: "2025-01-01",
        },
      ])
      .returning();

    const before = await getWatchlistOrderState(watchlist.id);
    await db
      .update(watchlistItems)
      .set({ releaseDate: "2024-01-01" })
      .where(eq(watchlistItems.id, firstItem.id));
    const after = await getWatchlistOrderState(watchlist.id);

    expect(before?.orderedItemIds).toEqual([secondItem.id, firstItem.id]);
    expect(after?.orderedItemIds).toEqual([firstItem.id, secondItem.id]);
    expect(after?.orderToken).not.toBe(before?.orderToken);
  });

  it("rejects an incomplete order without changing ranks", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Ordered", itemOrderMode: "custom" })
      .returning();
    const items = await db
      .insert(watchlistItems)
      .values([
        { watchlistId: watchlist.id, tmdbId: "1", title: "One", mediaType: "movie", customRank: 1 },
        { watchlistId: watchlist.id, tmdbId: "2", title: "Two", mediaType: "movie", customRank: 2 },
      ])
      .returning();

    const result = await setWatchlistOrder({
      watchlistId: watchlist.id,
      orderedItemIds: [items[0].id],
    });

    expect(result.success).toBe(false);
    expect((result as { code: string }).code).toBe("invalid_order");
  });

  it("rejects a stale order token", async () => {
    const [watchlist] = await db
      .insert(watchlists)
      .values({ name: "Ordered", itemOrderMode: "custom" })
      .returning();
    const [item] = await db
      .insert(watchlistItems)
      .values({
        watchlistId: watchlist.id,
        tmdbId: "1",
        title: "One",
        mediaType: "movie",
        customRank: 1,
      })
      .returning();

    const result = await setWatchlistOrder({
      watchlistId: watchlist.id,
      orderedItemIds: [item.id],
      expectedOrderToken: "sha256:stale",
    });

    expect(result.success).toBe(false);
    expect((result as { code: string }).code).toBe("stale_order");
  });
});
