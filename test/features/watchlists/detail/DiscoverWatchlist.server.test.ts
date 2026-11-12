import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/Schema";
import { createIsolatedTestDb, type IsolatedTestDb } from "@test/IsolatedDb";
import {
  createWatchlistOrderToken,
  getWatchlistOrderState,
} from "@/features/watchlists/order/SetWatchlistOrder.server";

const dbState = vi.hoisted(() => ({ db: undefined as IsolatedTestDb | undefined }));

vi.mock("@/db/Db.server", () => ({ getDb: () => dbState.db }));

let testDb: Awaited<ReturnType<typeof createIsolatedTestDb>>;
let db: IsolatedTestDb;
const { watchlists, watchlistItems } = schema;

let discovery: typeof import("@/features/watchlists/detail/DiscoverWatchlist.server");

beforeAll(async () => {
  testDb = await createIsolatedTestDb();
  db = testDb.db;
  dbState.db = db;
  discovery = await import("@/features/watchlists/detail/DiscoverWatchlist.server");
});

afterAll(() => testDb.close());

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

async function seedDiscoveryWatchlist() {
  const [watchlist] = await db.insert(watchlists).values({ name: "Discovery" }).returning();
  const items = await db
    .insert(watchlistItems)
    .values([
      {
        watchlistId: watchlist.id,
        tmdbId: "alpha",
        source: "tmdb",
        mediaType: "movie",
        title: "Alpha",
        releaseDate: "2024-01-01",
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "pilot",
        source: "tmdb",
        mediaType: "episode",
        title: "Pilot",
        parentId: "show-1",
        parentTitle: "Beta Show",
        releaseDate: "2024-01-02",
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "finale",
        source: "tmdb",
        mediaType: "episode",
        title: "Finale",
        parentId: "show-1",
        parentTitle: "Beta Show",
        releaseDate: "2024-01-03",
      },
      {
        watchlistId: watchlist.id,
        tmdbId: "gamma",
        source: "tmdb",
        mediaType: "movie",
        title: "Gamma",
        releaseDate: "2024-01-04",
      },
    ])
    .returning();

  return { watchlist, items };
}

describe("watchlist discovery", () => {
  it("returns summary, order token, and paginated items from one read surface", async () => {
    const { watchlist, items } = await seedDiscoveryWatchlist();

    const firstPage = await discovery.discoverWatchlistItems({
      watchlistId: watchlist.id,
      pageSize: 2,
    });

    expect(firstPage).toMatchObject({
      watchlist: { id: watchlist.id, name: "Discovery", stats: { totalItems: 4 } },
      items: [{ title: "Alpha" }, { title: "Pilot" }],
      nextCursor: expect.any(String),
    });
    expect(firstPage?.orderToken).toBe(
      createWatchlistOrderToken(
        watchlist.id,
        items.map((item) => item.id),
        "release",
      ),
    );
    await expect(getWatchlistOrderState(watchlist.id)).resolves.toMatchObject({
      orderToken: firstPage?.orderToken,
    });
  });

  it("binds item cursors to the watchlist, page size, query, and result view", async () => {
    const { watchlist } = await seedDiscoveryWatchlist();
    const firstPage = await discovery.discoverWatchlistItems({
      watchlistId: watchlist.id,
      pageSize: 2,
    });
    const secondPage = await discovery.discoverWatchlistItems({
      watchlistId: watchlist.id,
      pageSize: 2,
      cursor: firstPage?.nextCursor,
    });

    expect(secondPage?.items.map((item) => item.title)).toEqual(["Finale", "Gamma"]);
    expect(secondPage?.nextCursor).toBeUndefined();

    await expect(
      discovery.discoverWatchlistItems({
        watchlistId: watchlist.id,
        pageSize: 1,
        cursor: firstPage?.nextCursor,
      }),
    ).rejects.toThrow("Invalid watchlist item cursor.");
    await expect(
      discovery.discoverWatchlistTitles({
        watchlistId: watchlist.id,
        pageSize: 2,
        cursor: firstPage?.nextCursor,
      }),
    ).rejects.toThrow("Invalid watchlist item cursor.");
  });

  it("groups parent titles with consistent matching counts across title reads", async () => {
    const { watchlist, items } = await seedDiscoveryWatchlist();

    const titlePage = await discovery.discoverWatchlistTitles({
      watchlistId: watchlist.id,
      pageSize: 2,
    });

    expect(titlePage).toMatchObject({
      watchlist: { id: watchlist.id, stats: { totalItems: 4 } },
      titles: [
        { title: "Alpha", providerId: "alpha", matchingItemCount: 1 },
        { title: "Beta Show", providerId: "show-1", matchingItemCount: 2 },
      ],
      nextCursor: expect.any(String),
    });

    const secondPage = await discovery.discoverWatchlistTitles({
      watchlistId: watchlist.id,
      pageSize: 2,
      cursor: titlePage?.nextCursor,
    });
    expect(secondPage?.titles).toEqual([
      {
        provider: "tmdb",
        providerId: "gamma",
        mediaType: "movie",
        title: "Gamma",
        matchingItemCount: 1,
      },
    ]);
    expect(secondPage?.nextCursor).toBeUndefined();

    await expect(
      discovery.discoverWatchlistItems({
        watchlistId: watchlist.id,
        pageSize: 2,
        cursor: titlePage?.nextCursor,
      }),
    ).rejects.toThrow("Invalid watchlist item cursor.");

    await expect(
      discovery.findWatchlistTitleMatches({
        watchlistId: watchlist.id,
        provider: "tmdb",
        providerId: "show-1",
        mediaType: "episode",
      }),
    ).resolves.toEqual([
      {
        provider: "tmdb",
        providerId: "show-1",
        mediaType: "episode",
        title: "Beta Show",
        matchingItemCount: 2,
      },
    ]);
    await expect(
      discovery.findWatchlistTitleMatches({
        watchlistId: watchlist.id,
        watchlistItemId: items[1].id,
      }),
    ).resolves.toMatchObject([{ title: "Beta Show", matchingItemCount: 1 }]);
  });

  it("paginates text searches and rejects cursors issued for another query", async () => {
    const { watchlist } = await seedDiscoveryWatchlist();

    const firstPage = await discovery.findWatchlistItemsByText({
      watchlistId: watchlist.id,
      query: "a",
      pageSize: 2,
    });
    expect(firstPage?.items).toHaveLength(2);
    expect(firstPage?.nextCursor).toEqual(expect.any(String));

    await expect(
      discovery.findWatchlistItemsByText({
        watchlistId: watchlist.id,
        query: "different",
        pageSize: 2,
        cursor: firstPage?.nextCursor,
      }),
    ).rejects.toThrow("Invalid watchlist item cursor.");

    const titlePage = await discovery.findWatchlistTitles({
      watchlistId: watchlist.id,
      query: "beta",
    });
    expect(titlePage?.titles).toMatchObject([{ title: "Beta Show", matchingItemCount: 2 }]);
  });

  it("reports missing watchlists through discovery reads", async () => {
    await expect(discovery.discoverWatchlistItems({ watchlistId: 999_999 })).resolves.toBeNull();
    await expect(discovery.discoverWatchlistTitles({ watchlistId: 999_999 })).resolves.toBeNull();
    await expect(
      discovery.findWatchlistItemsByText({ watchlistId: 999_999, query: "anything" }),
    ).resolves.toBeNull();
    await expect(
      discovery.findWatchlistTitles({ watchlistId: 999_999, query: "anything" }),
    ).resolves.toBeNull();
  });
});
