import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

import { loadWatchlistDetailPage, loadWatchlistsIndex } from "./index";

let db: ReturnType<typeof import("@/db/db.server").getDb>;
let watchlists: typeof import("@/db/schema").watchlists;
let watchlistItems: typeof import("@/db/schema").watchlistItems;
let closeDb: typeof import("@/db/db.server").closeDb;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";

  const dbModule = await import("@/db/db.server");
  const schemaModule = await import("@/db/schema");

  db = dbModule.getDb();
  closeDb = dbModule.closeDb;
  watchlists = schemaModule.watchlists;
  watchlistItems = schemaModule.watchlistItems;

  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

afterAll(() => {
  closeDb?.();
});

beforeEach(async () => {
  await db.delete(watchlistItems);
  await db.delete(watchlists);
});

describe("watchlists feature shell", () => {
  it("loads the watchlist index through the feature-owned surface", async () => {
    const [watchFirst] = await db
      .insert(watchlists)
      .values({ name: "First watched", lastWatchedAt: "2024-01-10 00:00:00" })
      .returning();
    const [watchSecond] = await db
      .insert(watchlists)
      .values({ name: "Second watched", lastWatchedAt: "2024-01-20 00:00:00" })
      .returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: watchFirst.id,
        tmdbId: "first-item",
        source: "tmdb",
        mediaType: "movie",
        title: "First Item",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: watchSecond.id,
        tmdbId: "second-item",
        source: "tmdb",
        mediaType: "movie",
        title: "Second Item",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
    ]);

    const result = await loadWatchlistsIndex();

    expect(result.map((watchlist) => watchlist.name)).toEqual(["First watched", "Second watched"]);
    expect(result[0]?.stats).toMatchObject({
      totalItems: 1,
      watchedItems: 1,
      progress: 100,
    });
    expect(result[1]?.stats.nextUnwatched?.title).toBe("Second Item");
  });

  it("loads watchlist detail through the feature-owned surface with route defaults intact", async () => {
    const [list] = await db.insert(watchlists).values({ name: "Detail shell" }).returning();

    await db.insert(watchlistItems).values([
      {
        watchlistId: list.id,
        tmdbId: "watched-item",
        source: "tmdb",
        mediaType: "movie",
        title: "Watched Item",
        releaseDate: "2024-01-01",
        isWatched: true,
      },
      {
        watchlistId: list.id,
        tmdbId: "next-up",
        source: "tmdb",
        mediaType: "movie",
        title: "Next Up",
        releaseDate: "2024-02-01",
        isWatched: false,
      },
    ]);

    const detail = await loadWatchlistDetailPage(String(list.id));

    expect(detail.items.map((item) => item.title)).toEqual(["Next Up"]);
    expect(detail.watchlist.stats).toMatchObject({
      totalItems: 2,
      watchedItems: 1,
      progress: 50,
    });
    expect(detail.watchlist.stats.nextUnwatched?.title).toBe("Next Up");
  });
});
